package com.kas.platform.pricing.api;

import com.kas.platform.pricing.RateCell;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The rate calendar — doc 58 §8 {@code GET /admin/rates/grid}.
 *
 * <p>Shaped as rows so a UI can render room types down and dates across without transposing:
 *
 * <pre>
 *                  20/08   21/08   22/08   23/08
 *   Deluxe          1.5M    1.5M    1.7M    1.7M
 *   Superior        1.2M    1.2M    1.3M    1.3M
 * </pre>
 *
 * <p>{@code amountMinor} is null where a room type has no price for a date — no rule matched and no
 * base price is set. A gap, never a zero: doc 56 §9 records base rates as OPEN, and rendering an
 * unpriced cell as free would be the worst possible reading of missing data.
 */
public record RateGridView(
        UUID propertyId,
        LocalDate from,
        LocalDate to,
        List<Row> rows) {

    /** One room type's rates across the range, in date order. */
    public record Row(UUID roomTypeId, List<RateCell> cells) {
    }

    static RateGridView of(UUID propertyId, LocalDate from, LocalDate to,
                           Map<UUID, List<RateCell>> grid) {
        List<Row> rows = new ArrayList<>();
        grid.forEach((roomTypeId, cells) -> rows.add(new Row(roomTypeId, cells)));
        return new RateGridView(propertyId, from, to, List.copyOf(rows));
    }
}
