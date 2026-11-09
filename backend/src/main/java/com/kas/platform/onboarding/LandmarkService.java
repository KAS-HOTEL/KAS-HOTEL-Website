package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Landmark;
import com.kas.platform.property.LandmarkRepository;
import com.kas.platform.property.LandmarkTranslation;
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
 * A property's nearby landmarks — doc 23 §3.3's {@code nearbyLandmarks[]}, which
 * doc 58 §3.1 puts on the guest property detail.
 *
 * <h2>Why this is a transaction</h2>
 *
 * <p>Creating a landmark touches two tables: {@code property_landmark} for the
 * measurements and {@code property_landmark_translation} for each locale's words.
 * {@code name} is {@code NOT NULL}, so a landmark committed without its text
 * would be a row the guest query can never return and the console cannot label —
 * a distance to nowhere.
 *
 * <h2>Distances are verified, not guessed</h2>
 *
 * <p>Doc 03 §5.2 asks for <strong>verified</strong> walking times. Both measures
 * are therefore optional and neither is derived from the other: a landmark with a
 * distance and no walking time keeps exactly that, because inventing "6 minutes"
 * from 500 metres would be the platform making a claim the hotel did not.
 */
@Service
public class LandmarkService {

    /**
     * Doc 25 freezes two locales, and {@code property_landmark_tr_locale}
     * enforces the same pair in the schema. Checked here so an unknown key is a
     * field-level {@code 400} rather than a constraint violation surfacing as a
     * {@code 500}.
     */
    private static final Set<String> LOCALES = Set.of("vi", "en");

    private static final String ENTITY = "property_landmark";

    private final LandmarkRepository landmarks;
    private final AuditLogger audit;

    public LandmarkService(LandmarkRepository landmarks, AuditLogger audit) {
        this.landmarks = landmarks;
        this.audit = audit;
    }

    public List<Landmark> list(UUID propertyId, AuthorizationScope scope) {
        return landmarks.findByProperty(propertyId, scope);
    }

    public Map<UUID, Map<String, LandmarkTranslation>> translations(
            List<UUID> landmarkIds, AuthorizationScope scope) {
        return landmarks.findTranslations(landmarkIds, scope);
    }

    public Landmark require(UUID landmarkId, AuthorizationScope scope) {
        return landmarks.findById(landmarkId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Landmark"));
    }

    /**
     * @throws NotFoundException the property is absent or outside {@code scope}
     * @throws KasException      {@code VALIDATION_FAILED} for an unsupported
     *                           locale, a blank name, no translations at all, or
     *                           a negative measurement
     */
    @Transactional
    public Landmark create(UUID propertyId, String type, Integer distanceMetres,
                           Integer walkingMinutes, int sortOrder,
                           Map<String, LandmarkTranslation> translations,
                           ResolvedActor actor, AuthorizationScope scope) {

        rejectNegativeMeasurements(distanceMetres, walkingMinutes);
        rejectUnusableTranslations(translations);

        UUID landmarkId = landmarks
                .create(propertyId, type, distanceMetres, walkingMinutes, sortOrder, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        writeTranslations(landmarkId, translations, scope);

        audit(actor, "property_landmark.created", landmarkId,
                Map.of("locales", List.copyOf(translations.keySet())), scope);

        return require(landmarkId, scope);
    }

    /**
     * Updates the measurements and the supplied locales.
     *
     * <p>A locale the caller omitted keeps its stored text rather than being
     * cleared by its own absence — the same rule the property editorial and
     * facility writers follow.
     */
    @Transactional
    public Landmark update(UUID landmarkId, String type, Integer distanceMetres,
                           Integer walkingMinutes, int sortOrder,
                           Map<String, LandmarkTranslation> translations,
                           ResolvedActor actor, AuthorizationScope scope) {

        rejectNegativeMeasurements(distanceMetres, walkingMinutes);
        rejectUnsupportedLocales(translations);
        require(landmarkId, scope);

        landmarks.update(landmarkId, type, distanceMetres, walkingMinutes, sortOrder, scope);
        writeTranslations(landmarkId, translations, scope);

        audit(actor, "property_landmark.updated", landmarkId,
                Map.of("locales", List.copyOf(translations.keySet())), scope);

        return require(landmarkId, scope);
    }

    /**
     * Removes a landmark outright.
     *
     * <p>The table has no {@code archived_at}, and that is right: a landmark is a
     * claim about the neighbourhood rather than a record of what a guest was
     * shown, so a wrong one should stop being made.
     */
    @Transactional
    public void delete(UUID landmarkId, ResolvedActor actor, AuthorizationScope scope) {
        require(landmarkId, scope);

        landmarks.delete(landmarkId, scope);

        audit(actor, "property_landmark.deleted", landmarkId, Map.of(), scope);
    }

    // ------------------------------------------------------------------ helpers

    private void writeTranslations(UUID landmarkId, Map<String, LandmarkTranslation> translations,
                                   AuthorizationScope scope) {
        translations.forEach((locale, text) ->
                landmarks.setTranslation(landmarkId, locale, text.name(), text.description(), scope));
    }

    /**
     * The schema's own checks, reported as field errors.
     *
     * <p>{@code property_landmark_dist_nonneg} and
     * {@code property_landmark_walk_nonneg} would otherwise reject these at the
     * database and surface as a {@code 500}.
     */
    private void rejectNegativeMeasurements(Integer distanceMetres, Integer walkingMinutes) {
        List<KasException.ErrorDetail> problems = new ArrayList<>();
        if (distanceMetres != null && distanceMetres < 0) {
            problems.add(new KasException.ErrorDetail("distanceMetres", "OUT_OF_RANGE",
                    "A distance cannot be negative."));
        }
        if (walkingMinutes != null && walkingMinutes < 0) {
            problems.add(new KasException.ErrorDetail("walkingMinutes", "OUT_OF_RANGE",
                    "A walking time cannot be negative."));
        }
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The landmark measurements could not be accepted.", problems);
        }
    }

    /**
     * A new landmark needs at least one locale, because {@code name} is
     * {@code NOT NULL}: a landmark with no translation row is a distance to a
     * place nobody named.
     */
    private void rejectUnusableTranslations(Map<String, LandmarkTranslation> translations) {
        if (translations.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A landmark needs a name in at least one locale.",
                    List.of(new KasException.ErrorDetail("translations", "REQUIRED",
                            "Give the landmark a name in Vietnamese or English.")));
        }
        rejectUnsupportedLocales(translations);
    }

    private void rejectUnsupportedLocales(Map<String, LandmarkTranslation> translations) {
        List<KasException.ErrorDetail> problems = new ArrayList<>();
        translations.forEach((locale, text) -> {
            if (!LOCALES.contains(locale)) {
                problems.add(new KasException.ErrorDetail("translations." + locale,
                        "UNSUPPORTED_LOCALE", "Only 'vi' and 'en' are supported."));
            } else if (text.name() == null || text.name().isBlank()) {
                problems.add(new KasException.ErrorDetail("translations." + locale + ".name",
                        "REQUIRED", "A landmark name cannot be blank."));
            }
        });
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The landmark text could not be accepted.", problems);
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
