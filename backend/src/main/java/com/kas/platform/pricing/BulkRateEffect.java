package com.kas.platform.pricing;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What a bulk rate edit would do — doc 58 §8 {@code POST /admin/rates/bulk-preview}.
 *
 * <p>Doc 56 §7 marks the preview <strong>mandatory</strong> and says why: "Applying a rate across 90
 * days without seeing the result is how revenue accidents happen."
 *
 * <p>This is the shape behind the operator's confirmation screen — "48 cells affected · Cancel ·
 * Confirm". It reports the effect per room type and in total, so the number an operator confirms is
 * the number that will change.
 *
 * @param cellsAffected room types × dates. The single figure the confirmation turns on
 * @param conflicts     reasons the apply would be refused. Non-empty means
 *                      {@code bulk-apply} will reject the whole request — never part of it
 */
public record BulkRateEffect(
        LocalDate dateFrom,
        LocalDate dateTo,
        int nights,
        long amountMinor,
        String currency,
        int cellsAffected,
        List<RoomTypeEffect> roomTypes,
        List<String> conflicts) {

    public BulkRateEffect {
        roomTypes = List.copyOf(roomTypes);
        conflicts = List.copyOf(conflicts);
    }

    public boolean isApplicable() {
        return conflicts.isEmpty();
    }

    /**
     * The effect on one room type.
     *
     * @param action  whether an existing rule is being repriced or a new one created. An operator
     *                correcting yesterday's bulk edit should see "update", not "create" — the second
     *                would suggest a duplicate rule is about to appear
     * @param currentLowest the lowest rate currently resolving across the range, or null if the room
     *                type has no price there today
     */
    public record RoomTypeEffect(
            UUID roomTypeId,
            String roomTypeSlug,
            int datesAffected,
            Long currentLowest,
            Long currentHighest,
            long newAmountMinor,
            Action action) {
    }

    /** Doc 56 §5.3 — rules are never deleted, so a bulk edit only ever creates or updates. */
    public enum Action {
        CREATE,
        UPDATE
    }
}
