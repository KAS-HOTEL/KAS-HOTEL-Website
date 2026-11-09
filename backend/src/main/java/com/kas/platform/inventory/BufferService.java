package com.kas.platform.inventory;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.RoomTypeRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.RuleStatus;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Buffer rule management and materialisation onto the daily inventory rows.
 *
 * <p>Doc 13 §3.4c ¶2: "The resolved value materialises into
 * {@code room_type_inventory_day.ota_allotment} on a rolling horizon." The column is now
 * {@code buffer_target} (doc 55 §3.2 withdrew {@code ota_allotment}), and materialisation here is
 * <strong>operator-invoked over an explicit date range</strong> rather than scheduled — consistent
 * with the OQ-117c decision that V1 has no scheduler and nothing generates inventory on its own.
 *
 * <p><strong>Manual per-day override (doc 13 §3.4c ¶2) is not implemented.</strong> Nothing in the
 * schema distinguishes a hand-typed buffer from a materialised one, so a re-run would silently
 * overwrite an override and the operator would have no way to see that it had. That is recorded as
 * OQ-127 rather than approximated.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class BufferService {

    private static final String ENTITY = "ota_safety_buffer_rule";

    private final OtaSafetyBufferRuleRepository rules;
    private final InventoryDayRepository inventory;
    private final RoomTypeRepository roomTypes;
    private final PropertyRepository properties;
    private final AuditLogger audit;

    public BufferService(OtaSafetyBufferRuleRepository rules, InventoryDayRepository inventory,
                         RoomTypeRepository roomTypes, PropertyRepository properties,
                         AuditLogger audit) {
        this.rules = rules;
        this.inventory = inventory;
        this.roomTypes = roomTypes;
        this.properties = properties;
        this.audit = audit;
    }

    public List<OtaSafetyBufferRule> list(UUID propertyId, AuthorizationScope scope) {
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        return rules.findByProperty(propertyId, scope);
    }

    /**
     * Creates a buffer rule as a {@code DRAFT}.
     *
     * <p>Refuses a channel-scoped rule outright. OQ-115b defers the channel dimension to V2, and
     * accepting a value the resolver would then ignore is worse than refusing it — an operator would
     * believe an Agoda-specific buffer was in force when nothing was withholding a room.
     */
    @Transactional
    public OtaSafetyBufferRule create(OtaSafetyBufferRule rule, ResolvedActor actor,
                                      AuthorizationScope scope) {
        requireNoChannelScope(rule);
        requireRoomTypeBelongsToProperty(rule, scope);

        if (rules.tiesWithExisting(rule, scope)) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "An equally applicable buffer rule already exists.",
                    List.of(new KasException.ErrorDetail("priority", "BUFFER_RULE_TIE",
                            "Another rule has the same scope, dates and priority. "
                                    + "Change the priority or the scope.")));
        }

        UUID id = rules.create(rule, actor.userId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        Map<String, Object> after = new HashMap<>();
        after.put("propertyId", rule.propertyId().toString());
        after.put("bufferType", rule.bufferType().name());
        after.put("priority", rule.priority());
        record(actor, "buffer.rule_created", id, after, scope);

        return require(id, scope);
    }

    @Transactional
    public OtaSafetyBufferRule setStatus(UUID ruleId, RuleStatus target, ResolvedActor actor,
                                         AuthorizationScope scope) {
        OtaSafetyBufferRule current = require(ruleId, scope);
        if (!current.status().canTransitionTo(target)) {
            throw com.kas.platform.shared.ConflictException.illegalTransition(
                    "bufferRuleStatus", current.status().name(), target.name());
        }
        rules.setStatus(ruleId, target, scope);
        record(actor, "buffer.rule_status_changed", ruleId,
                Map.of("from", current.status().name(), "to", target.name()), scope);
        return require(ruleId, scope);
    }

    /**
     * Resolves and writes {@code buffer_target} for every existing inventory day in a range.
     *
     * <p>Only rows that already exist are touched. Materialisation never creates inventory: a day
     * with no row has no {@code total} to take a percentage of, and conjuring one would be inventing
     * a quantity (OQ-117b).
     *
     * @return how many days were written
     */
    @Transactional
    public int materialise(UUID roomTypeId, LocalDate from, LocalDate to, ResolvedActor actor,
                           AuthorizationScope scope) {
        roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));

        List<InventoryDay> days = inventory.lockForUpdate(roomTypeId, from, to, scope);
        int written = 0;

        for (InventoryDay day : days) {
            int resolved = BufferResolver.resolve(
                    rules.candidatesFor(roomTypeId, day.date(), scope), day);
            if (resolved != day.bufferTarget()) {
                inventory.setBufferTarget(roomTypeId, day.date(), resolved, scope);
                written++;
            }
        }

        record(actor, "buffer.materialised", roomTypeId, Map.of(
                "from", from.toString(), "to", to.toString(),
                "daysConsidered", days.size(), "daysChanged", written), scope);
        return written;
    }

    private OtaSafetyBufferRule require(UUID ruleId, AuthorizationScope scope) {
        return rules.findById(ruleId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Buffer rule"));
    }

    private static void requireNoChannelScope(OtaSafetyBufferRule rule) {
        if (rule.distributionChannelId() != null) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Channel-specific OTA buffer rules are not part of V1.",
                    List.of(new KasException.ErrorDetail("distributionChannelId", "DEFERRED_TO_V2",
                            "buffer_target is one value per room type and date; how several "
                                    + "channel buffers would combine is not defined. See OQ-115b.")));
        }
    }

    /** A room-type-scoped rule must name a room type of the property it claims. */
    private void requireRoomTypeBelongsToProperty(OtaSafetyBufferRule rule,
                                                  AuthorizationScope scope) {
        if (rule.roomTypeId() == null) {
            return;
        }
        UUID owning = roomTypes.findById(rule.roomTypeId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"))
                .propertyId();

        if (!owning.equals(rule.propertyId())) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "That room type does not belong to that property.");
        }
    }

    private void record(ResolvedActor actor, String action, UUID entityId,
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
