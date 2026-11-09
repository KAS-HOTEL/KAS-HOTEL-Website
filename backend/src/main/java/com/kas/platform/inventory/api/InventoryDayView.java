package com.kas.platform.inventory.api;

import com.kas.platform.inventory.InventoryDay;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One inventory cell, for the operator calendar — doc 58 §6 {@code GET /ops/inventory}.
 *
 * <p>This is an <strong>operator</strong> shape and it carries the internal
 * counters on purpose: doc 04 §4.3 describes the calendar as "each cell showing
 * available/total", and an operator cannot decide whether to release a block
 * without seeing what is committed. The doc 58 §9 denylist governs Public and
 * {@code /me}, not the operations console — which is why this type lives in
 * {@code inventory.api} behind {@code inventory.view}, and why the guest-facing
 * {@link RoomTypeAvailabilityView} shares none of these fields.
 *
 * <p>{@code availableDirect} is computed, never stored and never writable — doc
 * 15 §2.1 and doc 58 §6, "{@code available} is not writable".
 */
public record InventoryDayView(
        UUID roomTypeId,
        LocalDate date,
        int total,
        int maintenance,
        int otherBlocks,
        int directCommitted,
        int otaCommitted,
        int bufferTarget,
        int availableDirect) {

    static InventoryDayView of(InventoryDay day) {
        return new InventoryDayView(
                day.roomTypeId(),
                day.date(),
                day.total(),
                day.maintenance(),
                day.otherBlocks(),
                day.directCommitted(),
                day.otaCommitted(),
                day.bufferTarget(),
                day.availableDirect());
    }
}
