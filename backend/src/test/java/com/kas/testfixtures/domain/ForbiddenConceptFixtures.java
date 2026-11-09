package com.kas.testfixtures.domain;

/**
 * Deliberately prohibited shapes, used to prove {@code ForbiddenConceptsRule}
 * actually detects them.
 *
 * <p>Outside {@code com.kas.platform} so nothing here is ever scanned, wired or
 * mistaken for production code.
 */
public final class ForbiddenConceptFixtures {

    private ForbiddenConceptFixtures() {
    }

    /** Prohibited entity — doc 52 §6. */
    public static final class PhysicalRoom {
        private final String label = "";

        public String label() {
            return label;
        }
    }

    /** Prohibited field — doc 58 §9 PHYSICAL group. */
    public record RoomWithNumber(String roomNumber, int floor) {
    }

    /** Prohibited: collapses salesStatus and stayStatus — doc 52 §4 R13. */
    public record ReservationWithGenericStatus(String status) {
    }

    /** Prohibited: merges the three separate channel concepts — doc 29. */
    public record ReservationWithSource(String source) {
    }

    /** Correct shape. Two named lifecycles, never merged. Must NOT be flagged. */
    public record CompliantReservation(String salesStatus, String stayStatus) {
    }
}
