package com.kas.platform.inventory;

import java.time.LocalDate;

/**
 * What a proposed inventory edit would do to one date.
 *
 * <p>Doc 15 §8 requires a bulk edit to show "Preview of every affected cell
 * before commit; conflicts listed rather than silently skipped", and doc 58 §6
 * marks the preview <strong>mandatory</strong>. This is one cell of that preview.
 *
 * <p>{@code conflict} is true when the proposed row would drive
 * {@link InventoryDay#availableDirect()} below zero — that is, when the edit
 * would oversell. The database CHECK would refuse such a write anyway; this
 * exists so the operator is told <em>which dates</em> and <em>by how much</em>
 * rather than receiving one opaque constraint violation on whichever row
 * PostgreSQL reached first.
 */
public record InventoryChange(
        LocalDate date,
        InventoryDay before,
        InventoryDay after,
        boolean conflict) {

    static InventoryChange of(InventoryDay before, InventoryDay after) {
        return new InventoryChange(before.date(), before, after, after.availableDirect() < 0);
    }

    /** How far below zero the edit would push availability. Zero when there is no conflict. */
    public int shortfall() {
        return conflict ? -after.availableDirect() : 0;
    }
}
