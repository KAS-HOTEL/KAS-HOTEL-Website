package com.kas.platform.inventory.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A range edit — doc 58 §6 {@code POST /ops/inventory/bulk}.
 *
 * <p>Doc 15 §8: "Bulk edit by range — Preview of every affected cell before
 * commit; conflicts listed rather than silently skipped." Both halves are
 * modelled: {@code /bulk/preview} returns the cells and writes nothing, and
 * {@code /bulk} refuses the whole range when any date conflicts, naming each one.
 *
 * <p>Dates are inclusive at both ends. This is a maintenance window, not a stay:
 * the check-out-night exclusion of doc 55 §2 applies to stays, and applying it
 * here would silently drop the last day an operator typed.
 *
 * <h2>One room type or several</h2>
 *
 * <p>{@code roomTypeIds} is the field to send. An operator closing a weekend
 * closes it for the rooms they sell, and {@code BulkRateRequest} has taken a list
 * since it was written — this is the inventory side matching it, so the two
 * halves of one bulk edit no longer disagree about how a selection is expressed.
 *
 * <p>{@code roomTypeId} stays accepted because callers already send it and the
 * singular form is exactly right for the one-room case. Send one or the other;
 * sending both is refused rather than guessed at, because guessing which the
 * caller meant is how a range lands on a room type nobody selected.
 *
 * <h2>Every value is optional, and that is the point</h2>
 *
 * <p>A null column is left alone. Closing sales sends {@code otherBlocks} and
 * nothing else, and the day's {@code total} survives untouched — which is what
 * makes reopening possible at all. {@code InventoryService} refuses a request
 * where all three are null rather than writing an audit entry for nothing.
 */
public record BulkInventoryRequest(

        UUID roomTypeId,

        List<UUID> roomTypeIds,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate from,

        @NotNull
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        LocalDate to,

        @Min(0)
        Integer total,

        @Min(0)
        Integer maintenance,

        @Min(0)
        Integer otherBlocks) {

    /**
     * The room types this edit addresses, however the caller chose to say it.
     *
     * @throws IllegalArgumentException never — validation belongs to the caller's
     *         error contract, so an ambiguous or empty selection is reported as a
     *         business rule by {@code InventoryService.ordered}
     */
    public List<UUID> selection() {
        boolean hasList = roomTypeIds != null && !roomTypeIds.isEmpty();
        if (hasList && roomTypeId != null) {
            // Ambiguous. Refusing beats silently preferring one of them.
            return List.of();
        }
        if (hasList) {
            return roomTypeIds;
        }
        return roomTypeId == null ? List.of() : List.of(roomTypeId);
    }
}
