package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Experience;
import com.kas.platform.property.ExperienceRepository;
import com.kas.platform.property.ExperienceTranslation;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A property's signature experiences — the publish invariant made authorable.
 *
 * <h2>What this unblocks</h2>
 *
 * <p>Doc 52 §3.1 makes <em>"≥1 signature experience"</em> a CONFIRMED condition
 * of publication and {@link PropertyCompletenessChecker} has enforced it from the
 * start, but {@code property_experience} had no writer — so every property in the
 * portfolio was permanently {@code DRAFT}. This service is the missing half.
 *
 * <h2>Why this is a transaction</h2>
 *
 * <p>Creating an experience touches two tables: {@code property_experience} for
 * the ordering and {@code property_experience_translation} for each locale's
 * words. {@code title} is {@code NOT NULL}, so an experience committed without
 * its text would be a row the guest query can never return and the console cannot
 * label — and, worse than merely useless, it would <strong>satisfy the publish
 * gate</strong>, which counts base rows. Requiring the title here is what keeps a
 * nameless row from being a back door through the checklist.
 *
 * <h2>What is deliberately not enforced</h2>
 *
 * <p>No maximum count, no required description, no required image, no required
 * time of day, no flagship rule. Doc 03 and doc 67 §1 propose "1–4", but only
 * "≥1" is confirmed, and Step 16A.47 settled the rest: the only rule is the one
 * the gate already applies.
 */
@Service
public class ExperienceService {

    /**
     * Doc 25 freezes two locales, and {@code property_experience_tr_locale}
     * enforces the same pair in the schema. Checked here so an unknown key is a
     * field-level {@code 400} rather than a constraint violation surfacing as a
     * {@code 500}.
     */
    private static final Set<String> LOCALES = Set.of("vi", "en");

    private static final String ENTITY = "property_experience";

    private final ExperienceRepository experiences;
    private final AuditLogger audit;

    public ExperienceService(ExperienceRepository experiences, AuditLogger audit) {
        this.experiences = experiences;
        this.audit = audit;
    }

    public List<Experience> list(UUID propertyId, AuthorizationScope scope) {
        return experiences.findByProperty(propertyId, scope);
    }

    public Map<UUID, Map<String, ExperienceTranslation>> translations(
            List<UUID> experienceIds, AuthorizationScope scope) {
        return experiences.findTranslations(experienceIds, scope);
    }

    public Experience require(UUID experienceId, AuthorizationScope scope) {
        return experiences.findById(experienceId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Experience"));
    }

    /**
     * @throws NotFoundException the property is absent or outside {@code scope}
     * @throws KasException      {@code VALIDATION_FAILED} for an unsupported
     *                           locale, a blank title, or no translations at all
     */
    @Transactional
    public Experience create(UUID propertyId, int sortOrder,
                             Map<String, ExperienceTranslation> translations,
                             ResolvedActor actor, AuthorizationScope scope) {

        rejectUnusableTranslations(translations);

        UUID experienceId = experiences.create(propertyId, sortOrder, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        writeTranslations(experienceId, translations, scope);

        audit(actor, "property_experience.created", experienceId,
                Map.of("locales", List.copyOf(translations.keySet())), scope);

        return require(experienceId, scope);
    }

    /**
     * Updates the ordering and the supplied locales.
     *
     * <p>A locale the caller omitted keeps its stored text rather than being
     * cleared by its own absence — the same rule the landmark and property
     * editorial writers follow. A title that <em>is</em> supplied may not be
     * blank, because the column will not hold one.
     */
    @Transactional
    public Experience update(UUID experienceId, int sortOrder,
                             Map<String, ExperienceTranslation> translations,
                             ResolvedActor actor, AuthorizationScope scope) {

        rejectUnsupportedLocales(translations);
        require(experienceId, scope);

        experiences.update(experienceId, sortOrder, scope);
        writeTranslations(experienceId, translations, scope);

        audit(actor, "property_experience.updated", experienceId,
                Map.of("locales", List.copyOf(translations.keySet())), scope);

        return require(experienceId, scope);
    }

    /**
     * Removes an experience outright.
     *
     * <p>The table has no {@code archived_at}, so this is a real delete.
     *
     * <p><strong>Removing the last one is allowed.</strong> It does not
     * un-publish the property — the publish gate runs at submit, not
     * continuously — but it will fail the next submission. Refusing the delete
     * instead would invent a rule no document states, and would trap a Partner
     * who wanted to replace their only experience with a better one.
     */
    @Transactional
    public void delete(UUID experienceId, ResolvedActor actor, AuthorizationScope scope) {
        require(experienceId, scope);

        experiences.delete(experienceId, scope);

        audit(actor, "property_experience.deleted", experienceId, Map.of(), scope);
    }

    // ------------------------------------------------------------------ helpers

    private void writeTranslations(UUID experienceId,
                                   Map<String, ExperienceTranslation> translations,
                                   AuthorizationScope scope) {
        translations.forEach((locale, text) -> experiences.setTranslation(
                experienceId, locale, text.title(), text.description(), scope));
    }

    /**
     * A new experience needs at least one locale, because {@code title} is
     * {@code NOT NULL} — and because the publish gate counts base rows, so a
     * titleless one would pass a checklist it cannot honestly satisfy.
     */
    private void rejectUnusableTranslations(Map<String, ExperienceTranslation> translations) {
        if (translations.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "An experience needs a title in at least one locale.",
                    List.of(new KasException.ErrorDetail("translations", "REQUIRED",
                            "Give the experience a title in Vietnamese or English.")));
        }
        rejectUnsupportedLocales(translations);
    }

    private void rejectUnsupportedLocales(Map<String, ExperienceTranslation> translations) {
        List<KasException.ErrorDetail> problems = new ArrayList<>();
        translations.forEach((locale, text) -> {
            if (!LOCALES.contains(locale)) {
                problems.add(new KasException.ErrorDetail("translations." + locale,
                        "UNSUPPORTED_LOCALE", "Only 'vi' and 'en' are supported."));
            } else if (text.title() == null || text.title().isBlank()) {
                problems.add(new KasException.ErrorDetail("translations." + locale + ".title",
                        "REQUIRED", "An experience title cannot be blank."));
            }
        });
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The experience text could not be accepted.", problems);
        }
    }

    private void audit(ResolvedActor actor, String action, UUID entityId,
                       Map<String, Object> after, AuthorizationScope scope) {
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, entityId,
                null, after, null, null, null, CorrelationId.current(), scope.toString()));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) {
            return UserRole.SUPER_ADMIN.name();
        }
        if (actor.roles().contains(UserRole.ADMIN)) {
            return UserRole.ADMIN.name();
        }
        return UserRole.CUSTOMER.name();
    }
}
