package com.kas.platform.inventory.api;

import jakarta.validation.constraints.Min;

/**
 * The three columns an operator may write — doc 58 §6, doc 52 §3.3.
 *
 * <p>All three are nullable so a partial edit stays partial: setting maintenance
 * must not silently zero the total. {@code null} means "leave as it is".
 *
 * <p>There is no {@code available} field, no {@code directCommitted}, no
 * {@code otaCommitted} and no {@code bufferTarget}. Doc 15 §2.1: "If an operator
 * could type an availability number directly, that number could disagree with
 * the component counts, and the disagreement would be invisible until a guest
 * was turned away." The committed counters move only through allocation, and the
 * buffer is materialised from its rules.
 *
 * <p><strong>No default and no upper bound on {@code total}.</strong> The room
 * count is business input A2, still {@code OPEN} (doc 51 §2), and inventing a
 * ceiling here would be inventing a business rule. The lower bound is the
 * database's: {@code inv_total_nonneg}.
 */
public record InventoryAdjustmentRequest(

        @Min(0)
        Integer total,

        @Min(0)
        Integer maintenance,

        @Min(0)
        Integer otherBlocks) {
}
