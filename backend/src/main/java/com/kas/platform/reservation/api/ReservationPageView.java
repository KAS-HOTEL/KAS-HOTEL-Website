package com.kas.platform.reservation.api;

import java.util.List;

/**
 * One page of reservations.
 *
 * <h2>Why this project gains a page shape here</h2>
 *
 * It had none: doc 58 freezes no pagination convention, and every list endpoint
 * before this one returned a bare array because every one of them is bounded by
 * something real — a partner's eight properties, one property's room types, one
 * request's notes. A reservation list is the first that is not: it grows with
 * every booking and never shrinks, so a bare array would eventually be a screen
 * that loads a year of history to show twenty rows.
 *
 * <p>The shape is the smallest one that answers the two questions a pager asks —
 * <em>where am I</em> and <em>is there more</em> — and nothing else. No
 * {@code totalPages}, which is {@code total} and {@code size} divided; no
 * {@code hasNext}, which is {@code (page + 1) * size < total}; no {@code first}
 * or {@code last} flags. A client can derive all of them, and a field that can
 * disagree with another field eventually does.
 *
 * <h2>{@code total} counts only what the caller may see</h2>
 *
 * It is produced by the same predicate and the same scope filter as
 * {@link #items}. That is a security property, not a convenience: a count taken
 * over a wider population would report that other partners' reservations exist
 * without ever showing one.
 *
 * @param items the page's rows, newest first
 * @param page  the zero-based page index that was served
 * @param size  the maximum number of rows a page may hold
 * @param total how many reservations match, across every page
 */
public record ReservationPageView(
        List<ReservationSummaryView> items,
        int page,
        int size,
        long total) {
}
