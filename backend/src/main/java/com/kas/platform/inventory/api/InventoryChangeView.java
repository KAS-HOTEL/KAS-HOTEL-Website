package com.kas.platform.inventory.api;

import com.kas.platform.inventory.InventoryChange;

import java.time.LocalDate;

/**
 * One preview cell — what an edit would do to one date, and whether it may.
 *
 * <p>Doc 58 §6 makes the preview mandatory for a bulk edit; doc 15 §8 requires
 * "conflicts listed rather than silently skipped". {@code conflict} and
 * {@code shortfall} are what make a refusal actionable instead of an opaque
 * constraint violation.
 */
public record InventoryChangeView(
        LocalDate date,
        InventoryDayView before,
        InventoryDayView after,
        boolean conflict,
        int shortfall) {

    static InventoryChangeView of(InventoryChange change) {
        return new InventoryChangeView(
                change.date(),
                InventoryDayView.of(change.before()),
                InventoryDayView.of(change.after()),
                change.conflict(),
                change.shortfall());
    }
}
