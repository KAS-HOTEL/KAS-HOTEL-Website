package com.kas.testfixtures.publicapi;

import com.kas.platform.shared.Money;

import java.util.List;
import java.util.UUID;

/**
 * Response shapes used to prove the denylist scanner works — both that it
 * catches leaks and that it does not flag the contract's own legitimate fields.
 */
public final class DenylistFixtures {

    private DenylistFixtures() {
    }

    /**
     * Compliant. The availability response from doc 58 §3.2, verbatim:
     * {@code availableQuantity} is "the ONLY inventory figure exposed".
     */
    public record RoomTypeAvailabilityView(
            String roomTypeSlug,
            String name,
            int availableQuantity,
            int maxQuantitySelectable,
            Money nightlyFrom,
            boolean availableForWholeStay) {
    }

    /** Compliant. Doc 58 §4 returns {@code total} as a money amount. */
    public record StayDetailView(String reference, Money total) {
    }

    /** Violation — PARTNER group. A guest never learns which organisation owns a hotel. */
    public record PartnerLeakView(UUID partnerId, String slug) {
    }

    /** Violation at depth two — the case a shallow check would miss. */
    public record NestedLeakView(String reference, InnerSalesLeak inner) {
    }

    public record InnerSalesLeak(String salesStatus) {
    }

    /** Violation inside a generic argument — the case a non-recursive check would miss. */
    public record CollectionLeakView(List<InnerSalesLeak> rooms) {
    }

    /**
     * Violation — the inventory {@code total}. Proves the {@code Money}
     * exception cannot be used to expose a room count.
     */
    public record InventoryTotalLeakView(int total) {
    }
}
