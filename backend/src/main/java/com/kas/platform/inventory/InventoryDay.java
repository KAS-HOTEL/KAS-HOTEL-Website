package com.kas.platform.inventory;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One room type, one date — the grain of all availability.
 *
 * <p>Doc 55 §2: "Grain: one room type, one date. Availability is meaningless
 * without a date."
 *
 * <p>Every field maps to a column on {@code room_type_inventory_day}. There is
 * no {@code available} field and there never will be one: doc 15 §2.1 —
 * "If an operator could type an availability number directly, that number could
 * disagree with the component counts, and the disagreement would be invisible
 * until a guest was turned away."
 *
 * @param total           units that physically exist for this room type on this date
 * @param maintenance     units out of service
 * @param otherBlocks     group holds, owner use, staff, contingency
 * @param directCommitted direct commitments <em>including ACTIVE holds</em> — doc 55 §3.1
 * @param otaCommitted    OTA reservations recorded in KAS
 * @param bufferTarget    the materialised OTA safety buffer for this date
 */
public record InventoryDay(
        UUID roomTypeId,
        LocalDate date,
        int total,
        int maintenance,
        int otherBlocks,
        int directCommitted,
        int otaCommitted,
        int bufferTarget) {

    /**
     * Doc 55 §3.1, in Java — <strong>for display and preview only</strong>.
     *
     * <p>This deliberately mirrors the SQL function {@code available_direct} and
     * the {@code inv_no_oversell} CHECK character for character. It is
     * <em>not</em> the guarantee: nothing in this class is consulted before a
     * write. Doc 88 §7 records why availability is a database function at all —
     * "so availability can never be typed in by an operator" — and a second
     * implementation in Java would be a second thing that can drift.
     *
     * <p>It exists so a bulk-edit preview can show an operator what a change
     * would do without writing it. {@code InventoryDayInvariantTest} asserts this
     * method and the database agree.
     */
    public int availableDirect() {
        return total - maintenance - otherBlocks - directCommitted - otaCommitted - unusedBuffer();
    }

    /**
     * The portion of the buffer still withheld.
     *
     * <p>Doc 55 §3.2: "If the buffer is 5 and OTA has already committed 3, only
     * <strong>2</strong> more should be withheld — the 3 are already counted in
     * OtaCommitted."
     */
    public int unusedBuffer() {
        return Math.max(bufferTarget - otaCommitted, 0);
    }

    /** What is consumed on this date regardless of the buffer — doc 55 §6.2's clamp input. */
    public int committedAndBlocked() {
        return maintenance + otherBlocks + directCommitted + otaCommitted;
    }
}
