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
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Operator inventory maintenance.
 *
 * <h2>What an operator may write</h2>
 *
 * <p>{@code total}, {@code maintenance} and {@code other_blocks} — nothing else.
 * Doc 58 §6: "{@code available} is not writable". Doc 52 §3.3: "System writes
 * commitments; {@code ADMIN} edits {@code total}, {@code maintenance},
 * {@code otherBlocks}." The committed counters move only through allocation.
 *
 * <h2>Where room quantity comes from</h2>
 *
 * <p>The per-room-type room count is <strong>operator-entered per date</strong>,
 * through {@link #adjust} and {@link #applyRange}. It is not derived and not
 * defaulted: {@code room_type} carries no count column, doc 51 A2 registers
 * "Room quantities ({@code total}) per room type" as an <em>OPEN</em> business
 * input owned by Operations, and doc 88 §11 records it as deliberately not
 * seeded. Nothing here invents one — a room type with no inventory rows simply
 * has no availability (doc 15 §12, fail closed).
 *
 * <p><strong>The rolling-horizon generation job of doc 15 §4.4 is not
 * implemented</strong>, because its stated seed — "the room type's default
 * {@code total}" — has no column to live in. See doc 97 §5 and OQ-117.
 *
 * <h2>Why conflicts are computed as well as constrained</h2>
 *
 * <p>{@code inv_no_oversell} is the guarantee and is never bypassed. But it
 * refuses one row at a time with an opaque {@code 23514}, which tells an operator
 * editing ninety days nothing useful. Every write path here therefore reads the
 * affected rows <em>under lock</em>, computes the effect, and refuses with the
 * conflicting dates named — then writes, and lets the CHECK have the last word.
 */
@Deprecated // Stock processing retired by owner decision 153.
public class InventoryService {

    private static final String ENTITY = "room_type_inventory_day";

    /**
     * A range wider than this is refused outright.
     *
     * <p>Not a business rule and not a limit on how much inventory may exist: it
     * bounds how many rows one request may lock at once, so a mistyped year
     * cannot lock a room type's entire horizon. Doc 55 §2's rolling horizon is 24
     * months, so two years of days is the natural ceiling.
     */
    static final int MAX_RANGE_DAYS = 732;

    private final InventoryDayRepository inventory;
    private final RoomTypeRepository roomTypes;
    private final PropertyRepository properties;
    private final AuditLogger audit;

    public InventoryService(InventoryDayRepository inventory, RoomTypeRepository roomTypes,
                            PropertyRepository properties, AuditLogger audit) {
        this.inventory = inventory;
        this.roomTypes = roomTypes;
        this.properties = properties;
        this.audit = audit;
    }

    /** The operator calendar — doc 58 §6 {@code GET /ops/inventory}. */
    public List<InventoryDay> calendar(UUID propertyId, LocalDate from, LocalDate to,
                                       AuthorizationScope scope) {
        properties.findById(propertyId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));
        requireSaneRange(from, to);
        return inventory.findCalendar(propertyId, from, to, scope);
    }

    /**
     * Sets operator columns on one date — doc 58 §6
     * {@code PATCH /ops/inventory/{roomTypeId}/{date}}.
     */
    @Transactional
    public InventoryDay adjust(UUID roomTypeId, LocalDate date, Integer total, Integer maintenance,
                               Integer otherBlocks, ResolvedActor actor, AuthorizationScope scope) {
        return applyRange(roomTypeId, date, date, total, maintenance, otherBlocks, actor, scope)
                .get(0).after();
    }

    /**
     * What {@link #applyRange} would do, without doing it — doc 58 §6
     * {@code POST /ops/inventory/bulk}, whose preview is mandatory.
     *
     * <p>Reads without locking. A preview is advisory by nature: an operator
     * looking at a screen is always looking at a snapshot, and {@link #applyRange}
     * re-derives under lock before writing anything.
     */
    /**
     * The same preview across several room types at once.
     *
     * <p>An operator closing a weekend closes it for the rooms they sell, not for
     * one room type seven times. The rate side has taken a list since it was
     * written ({@code BulkRateRequest.roomTypeIds}); this is the inventory side
     * catching up, and it is the same range walk per room type rather than a
     * second algorithm.
     *
     * <p>Ordered by room type id so the preview an operator reads and the lock
     * order {@link #applyRange(List, LocalDate, LocalDate, Integer, Integer,
     * Integer, ResolvedActor, AuthorizationScope)} takes are the same sequence.
     */
    public List<InventoryChange> preview(List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                                         Integer total, Integer maintenance, Integer otherBlocks,
                                         AuthorizationScope scope) {
        List<UUID> selection = ordered(roomTypeIds);
        selection.forEach(roomTypeId -> requireRoomTypeInScope(roomTypeId, scope));

        List<InventoryChange> changes = new ArrayList<>();
        for (UUID roomTypeId : selection) {
            changes.addAll(preview(roomTypeId, from, to, total, maintenance, otherBlocks, scope));
        }
        return List.copyOf(changes);
    }

    /**
     * Applies across several room types, or refuses the whole selection.
     *
     * <p>One transaction covering every room type, deliberately. Doc 15 §8 rules
     * out writing the days that fit and dropping the ones that do not, and the
     * same reasoning applies across a selection: an operator who closed four room
     * types and was told two of them failed would not know which two are now
     * closed. Either the selection applies or none of it does.
     */
    @Transactional
    public List<InventoryChange> applyRange(List<UUID> roomTypeIds, LocalDate from, LocalDate to,
                                            Integer total, Integer maintenance, Integer otherBlocks,
                                            ResolvedActor actor, AuthorizationScope scope) {
        List<UUID> selection = ordered(roomTypeIds);

        // Every room type is checked before any of them is written. The rollback
        // would cover it either way, but a selection that smuggles in somebody
        // else's room should not reach a write at all — and "nothing happened"
        // is a far easier thing to be sure of than "it was undone".
        selection.forEach(roomTypeId -> requireRoomTypeInScope(roomTypeId, scope));

        List<InventoryChange> changes = new ArrayList<>();
        for (UUID roomTypeId : selection) {
            changes.addAll(applyRange(roomTypeId, from, to, total, maintenance, otherBlocks,
                    actor, scope));
        }
        return List.copyOf(changes);
    }

    /**
     * Room types in id order, with duplicates removed.
     *
     * <p>Sorted because {@link #applyRange} locks {@code (room_type_id, date)} and
     * doc 55 §7 wants one global ordering; two operators editing overlapping
     * selections in different orders is precisely how a deadlock is made.
     * De-duplicated because a client sending the same id twice would otherwise
     * lock it twice and preview it twice.
     */
    private static List<UUID> ordered(List<UUID> roomTypeIds) {
        if (roomTypeIds == null || roomTypeIds.isEmpty()) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Select at least one room type.");
        }
        return roomTypeIds.stream().distinct().sorted().toList();
    }

    public List<InventoryChange> preview(UUID roomTypeId, LocalDate from, LocalDate to,
                                         Integer total, Integer maintenance, Integer otherBlocks,
                                         AuthorizationScope scope) {
        requireRoomTypeInScope(roomTypeId, scope);
        requireSaneRange(from, to);
        requireSomethingToChange(total, maintenance, otherBlocks);

        Map<LocalDate, InventoryDay> existing =
                byDate(inventory.findRange(roomTypeId, from, to, scope));

        List<InventoryChange> changes = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            InventoryDay before = existing.getOrDefault(date, emptyDay(roomTypeId, date));
            changes.add(InventoryChange.of(before, project(before, total, maintenance, otherBlocks)));
        }
        return List.copyOf(changes);
    }

    /**
     * Applies operator columns across a date range, or refuses naming every
     * conflicting date.
     *
     * <p>Creates the daily rows that do not exist yet. That is the <em>only</em>
     * place inventory rows come into being: a read never creates one, because a
     * row conjured by a read would turn "no inventory" into "zero available", and
     * a later blanket total edit would then quietly make it bookable.
     */
    @Transactional
    public List<InventoryChange> applyRange(UUID roomTypeId, LocalDate from, LocalDate to,
                                            Integer total, Integer maintenance, Integer otherBlocks,
                                            ResolvedActor actor, AuthorizationScope scope) {
        requireRoomTypeInScope(roomTypeId, scope);
        requireSaneRange(from, to);
        requireSomethingToChange(total, maintenance, otherBlocks);

        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            inventory.ensureRow(roomTypeId, date, scope);
        }

        // Locked in (room_type_id, date) order — doc 55 §7, doc 15 §5.1.
        List<InventoryDay> locked = inventory.lockForUpdate(roomTypeId, from, to, scope);

        List<InventoryChange> changes = new ArrayList<>();
        for (InventoryDay before : locked) {
            changes.add(InventoryChange.of(before, project(before, total, maintenance, otherBlocks)));
        }

        List<InventoryChange> conflicts = changes.stream().filter(InventoryChange::conflict).toList();
        if (!conflicts.isEmpty()) {
            throw conflictError(conflicts);
        }

        for (InventoryChange change : changes) {
            inventory.setOperatorColumns(roomTypeId, change.date(), total, maintenance, otherBlocks,
                    scope);
        }

        Map<String, Object> recorded = new HashMap<>();
        recorded.put("from", from.toString());
        recorded.put("to", to.toString());
        recorded.put("days", changes.size());
        putIfPresent(recorded, "total", total);
        putIfPresent(recorded, "maintenance", maintenance);
        putIfPresent(recorded, "otherBlocks", otherBlocks);
        record(actor, "inventory.adjusted", roomTypeId, recorded, scope);

        return List.copyOf(changes);
    }

    // ------------------------------------------------------------------ helpers

    /**
     * Doc 15 §8: "Blocked with an explanation naming the conflicting dates."
     *
     * <p>This is an operator surface, so the figures may be shown. The doc 58 §9
     * denylist governs Public and {@code /me} responses; it does not reach here,
     * and withholding the numbers would leave the operator unable to act.
     */
    private static BusinessRuleException conflictError(List<InventoryChange> conflicts) {
        List<KasException.ErrorDetail> details = conflicts.stream()
                .map(c -> new KasException.ErrorDetail(
                        c.date().toString(), "WOULD_OVERSELL",
                        "Short by " + c.shortfall() + " on this date; "
                                + c.after().committedAndBlocked()
                                + " already committed or blocked."))
                .toList();

        return new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "This change would oversell " + conflicts.size()
                        + (conflicts.size() == 1 ? " date." : " dates."),
                details);
    }

    private static InventoryDay project(InventoryDay before, Integer total, Integer maintenance,
                                        Integer otherBlocks) {
        return new InventoryDay(
                before.roomTypeId(),
                before.date(),
                total == null ? before.total() : total,
                maintenance == null ? before.maintenance() : maintenance,
                otherBlocks == null ? before.otherBlocks() : otherBlocks,
                before.directCommitted(),
                before.otaCommitted(),
                before.bufferTarget());
    }

    private static InventoryDay emptyDay(UUID roomTypeId, LocalDate date) {
        return new InventoryDay(roomTypeId, date, 0, 0, 0, 0, 0, 0);
    }

    private static Map<LocalDate, InventoryDay> byDate(List<InventoryDay> days) {
        Map<LocalDate, InventoryDay> byDate = new HashMap<>();
        days.forEach(day -> byDate.put(day.date(), day));
        return byDate;
    }

    private static void putIfPresent(Map<String, Object> target, String key, Integer value) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private void requireRoomTypeInScope(UUID roomTypeId, AuthorizationScope scope) {
        roomTypes.findById(roomTypeId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Room type"));
    }

    private static void requireSaneRange(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "The end date is before the start date.");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_RANGE_DAYS) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "That range covers more than " + MAX_RANGE_DAYS + " days. Split the edit.");
        }
    }

    private static void requireSomethingToChange(Integer total, Integer maintenance,
                                                 Integer otherBlocks) {
        if (total == null && maintenance == null && otherBlocks == null) {
            throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                    "Provide at least one of total, maintenance or otherBlocks.");
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
