package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Facility;
import com.kas.platform.property.FacilityRepository;
import com.kas.platform.property.FacilityTranslation;
import com.kas.platform.property.FacilityType;
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
 * A property's facility blocks — doc 23 §5, doc 58 §8's
 * {@code /admin/properties/{id}/facilities}.
 *
 * <h2>Why this is a transaction</h2>
 *
 * <p>Creating a facility touches two tables: {@code facility} for the structure
 * and {@code facility_translation} for each locale's words. {@code name} is
 * {@code NOT NULL}, so a facility committed without its text would be a row the
 * guest query can never return and the Partner cannot see the name of — visible
 * in the console as a nameless block and invisible to guests, with no way to tell
 * which of the two happened.
 *
 * <h2>The type is set once</h2>
 *
 * <p>Update does not change {@code facility_type}. Doc 23 §5 makes the type what
 * the block <em>is</em>, and a block that turned from {@code POOL} into
 * {@code MEETING} would keep the pool's name and description while claiming to be
 * a meeting room. Deleting and re-creating says the same thing honestly.
 */
@Service
public class FacilityService {

    /**
     * Doc 25 freezes two locales, and {@code facility_tr_locale} enforces the same
     * pair in the schema. Checked here so an unknown key is a field-level
     * {@code 400} rather than a constraint violation surfacing as a {@code 500}.
     */
    private static final Set<String> LOCALES = Set.of("vi", "en");

    private static final String ENTITY = "facility";

    private final FacilityRepository facilities;
    private final AuditLogger audit;

    public FacilityService(FacilityRepository facilities, AuditLogger audit) {
        this.facilities = facilities;
        this.audit = audit;
    }

    /** Every facility of a property, archived ones included — the Partner's view. */
    public List<Facility> list(UUID propertyId, AuthorizationScope scope) {
        return facilities.findByProperty(propertyId, scope);
    }

    public Map<UUID, Map<String, FacilityTranslation>> translations(
            List<UUID> facilityIds, AuthorizationScope scope) {
        return facilities.findTranslations(facilityIds, scope);
    }

    public Facility require(UUID facilityId, AuthorizationScope scope) {
        return facilities.findById(facilityId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Facility"));
    }

    /**
     * Creates a facility with at least one locale's text.
     *
     * @throws NotFoundException the property is absent or outside {@code scope}
     * @throws KasException      {@code VALIDATION_FAILED} for an unsupported
     *                           locale, or for no translations at all
     */
    @Transactional
    public Facility create(UUID propertyId, FacilityType type, Boolean openToNonResidents,
                           int sortOrder, Map<String, FacilityTranslation> translations,
                           ResolvedActor actor, AuthorizationScope scope) {

        rejectUnusableTranslations(translations);

        UUID facilityId = facilities
                .create(propertyId, type, openToNonResidents, sortOrder, actor.userId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        writeTranslations(facilityId, translations, scope);

        audit(actor, "facility.created", facilityId,
                Map.of("type", type.name(), "locales", List.copyOf(translations.keySet())), scope);

        return require(facilityId, scope);
    }

    /**
     * Updates the structure and the supplied locales.
     *
     * <p>A locale the caller omitted keeps its stored text rather than being
     * cleared by its own absence — the same rule the property editorial writer
     * follows.
     */
    @Transactional
    public Facility update(UUID facilityId, Boolean openToNonResidents, int sortOrder,
                           Map<String, FacilityTranslation> translations, ResolvedActor actor,
                           AuthorizationScope scope) {

        rejectUnsupportedLocales(translations);
        require(facilityId, scope);

        facilities.update(facilityId, openToNonResidents, sortOrder, actor.userId(), scope);
        writeTranslations(facilityId, translations, scope);

        audit(actor, "facility.updated", facilityId,
                Map.of("locales", List.copyOf(translations.keySet())), scope);

        return require(facilityId, scope);
    }

    /**
     * Archives a facility — how it leaves the guest page.
     *
     * <p>The row stays. A facility that was on the page yesterday is part of what
     * a guest saw, and a hard delete would erase that; the public query already
     * excludes archived rows, so the page is correct either way.
     */
    @Transactional
    public void archive(UUID facilityId, ResolvedActor actor, AuthorizationScope scope) {
        Facility facility = require(facilityId, scope);

        facilities.archive(facilityId, actor.userId(), scope);

        audit(actor, "facility.archived", facilityId,
                Map.of("type", facility.type().name()), scope);
    }

    // ------------------------------------------------------------------ helpers

    private void writeTranslations(UUID facilityId, Map<String, FacilityTranslation> translations,
                                   AuthorizationScope scope) {
        translations.forEach((locale, text) ->
                facilities.setTranslation(facilityId, locale, text.name(), text.description(), scope));
    }

    /**
     * A new facility needs at least one locale, because {@code name} is
     * {@code NOT NULL}: a facility with no translation row is one no guest query
     * can return and no console screen can label.
     */
    private void rejectUnusableTranslations(Map<String, FacilityTranslation> translations) {
        if (translations.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A facility needs a name in at least one locale.",
                    List.of(new KasException.ErrorDetail("translations", "REQUIRED",
                            "Give the facility a name in Vietnamese or English.")));
        }
        rejectUnsupportedLocales(translations);
    }

    private void rejectUnsupportedLocales(Map<String, FacilityTranslation> translations) {
        List<KasException.ErrorDetail> problems = new ArrayList<>();
        translations.forEach((locale, text) -> {
            if (!LOCALES.contains(locale)) {
                problems.add(new KasException.ErrorDetail("translations." + locale,
                        "UNSUPPORTED_LOCALE", "Only 'vi' and 'en' are supported."));
            } else if (text.name() == null || text.name().isBlank()) {
                // The schema's own check, reported as a field error rather than
                // reaching the database and coming back as a 500.
                problems.add(new KasException.ErrorDetail("translations." + locale + ".name",
                        "REQUIRED", "A facility name cannot be blank."));
            }
        });
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The facility text could not be accepted.", problems);
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
