package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.Property;
import com.kas.platform.property.PropertyLifecycleState;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Permanently deletes a hotel draft — owner decision 2026-11-08: ADMIN only, a
 * hard delete, and only for a hotel that was never published and has no booking or
 * review history.
 *
 * <p>What goes with it: its room types and everything they own (prices, rate rules,
 * day prices, surcharges, inventory days, translations, amenities, policies — all
 * {@code ON DELETE CASCADE} or deleted here), and the gallery placements of the hotel
 * and its rooms. The uploaded image files themselves stay in the media library: an
 * asset may be placed elsewhere too, and {@code media_link} is what ties it here.
 *
 * <p>What stops it: anything a guest or a booking left behind. Those tables reference
 * the hotel or its rooms {@code ON DELETE RESTRICT} precisely so history cannot vanish;
 * they are checked first so the refusal is a clear 409, not a database error.
 */
@Service
public class PropertyDeletionService {

    /** Tables holding guest or booking history for a hotel. Any row blocks deletion. */
    private static final List<String> PROPERTY_HISTORY = List.of(
            "reservation", "inventory_hold", "review", "reservation_assignment",
            "reservation_availability_check", "trip_com_rating_quarterly_snapshot",
            "reservation_quote_line", "reservation_alternative_offer");

    /** The same, referencing a room type of the hotel. */
    private static final List<String> ROOM_HISTORY = List.of(
            "reservation_line", "inventory_hold", "reservation_alternative_offer_line",
            "reservation_quote_line");

    private final PropertyRepository properties;
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public PropertyDeletionService(PropertyRepository properties, JdbcClient jdbc, AuditLogger audit) {
        this.properties = properties;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public void deleteDraft(UUID propertyId, ResolvedActor actor, AuthorizationScope scope) {
        Property property = properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        if (property.lifecycleState() != PropertyLifecycleState.DRAFT || property.publishedAt() != null) {
            throw refuse("NOT_DRAFT", "Only a hotel draft that was never published can be deleted.");
        }
        for (String table : PROPERTY_HISTORY) {
            if (exists("SELECT 1 FROM " + table + " WHERE property_id = :id LIMIT 1", propertyId)) {
                throw refuse("HAS_HISTORY", "This hotel has booking or review history and cannot be deleted.");
            }
        }
        for (String table : ROOM_HISTORY) {
            if (exists("SELECT 1 FROM " + table + " t JOIN room_type rt ON rt.id = t.room_type_id"
                    + " WHERE rt.property_id = :id LIMIT 1", propertyId)) {
                throw refuse("HAS_HISTORY", "This hotel has booking or review history and cannot be deleted.");
            }
        }

        // Gallery placements are polymorphic (no foreign key), so they are removed here.
        jdbc.sql("""
                DELETE FROM media_link
                 WHERE (owner_type = 'PROPERTY' AND owner_id = :id)
                    OR (owner_type = 'ROOM_TYPE' AND owner_id IN (SELECT id FROM room_type WHERE property_id = :id))
                """).param("id", propertyId).update();
        // Capacity rows only: with no booking history nothing is committed against them.
        jdbc.sql("DELETE FROM room_type_inventory_day WHERE room_type_id IN (SELECT id FROM room_type WHERE property_id = :id)")
                .param("id", propertyId).update();
        jdbc.sql("DELETE FROM room_type WHERE property_id = :id").param("id", propertyId).update();
        int deleted = jdbc.sql("DELETE FROM property WHERE id = :id").param("id", propertyId).update();
        if (deleted != 1) throw NotFoundException.outOfScope("Property");

        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), "property.deleted", "property", propertyId,
                Map.of("slug", property.slug(), "lifecycleState", property.lifecycleState().name()),
                null, null, null, null,
                CorrelationId.current(), scope.toString()));
    }

    private boolean exists(String sql, UUID propertyId) {
        return jdbc.sql(sql).param("id", propertyId).query(Integer.class).optional().isPresent();
    }

    private static KasException refuse(String code, String message) {
        return new KasException(ApiErrorCode.ILLEGAL_TRANSITION, message,
                List.of(new KasException.ErrorDetail("property", code, message)));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) return UserRole.SUPER_ADMIN.name();
        if (actor.roles().contains(UserRole.ADMIN)) return UserRole.ADMIN.name();
        return UserRole.CUSTOMER.name();
    }
}
