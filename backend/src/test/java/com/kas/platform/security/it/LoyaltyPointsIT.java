package com.kas.platform.security.it;

import com.kas.platform.customer.LoyaltyPointsService;
import com.kas.platform.reservation.ReservationEmailActionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** KAS points on bookings: hold, spend on payment, release, return, earn (2026-11-10). Rolled back. */
class LoyaltyPointsIT extends SecurityIntegrationTest {

    @Autowired JdbcClient jdbc;
    @Autowired LoyaltyPointsService points;
    @Autowired ReservationEmailActionService actions;

    private UUID propertyId;
    private UUID customerId;
    private UUID goldTierId;

    @BeforeEach
    void prepare() {
        UUID partner = fixtures.createPartner("loyalty");
        propertyId = fixtures.createProperties(partner, 1).getFirst();
        customerId = jdbc.sql("""
                INSERT INTO customer (full_name, email, customer_code) VALUES ('Points Member', :e, :code) RETURNING id
                """).param("e", "points-" + UUID.randomUUID() + "@example.invalid")
                .param("code", "KAS-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase())
                .query(UUID.class).single();
        UUID membership = jdbc.sql("INSERT INTO customer_membership (customer_id) VALUES (:c) RETURNING id")
                .param("c", customerId).query(UUID.class).single();
        goldTierId = jdbc.sql("SELECT id FROM membership_tier WHERE code = 'GOLD'").query(UUID.class).single();
        jdbc.sql("""
                INSERT INTO customer_membership_tier_history (membership_id, tier_id, effective_from)
                VALUES (:m, :t, now() - interval '1 day')
                """).param("m", membership).param("t", goldTierId).update();
        jdbc.sql("INSERT INTO cashback_account (customer_id, balance_points) VALUES (:c, 500000)")
                .param("c", customerId).update();
    }

    /** A member's booking awaiting payment: rooms 1,000,000, member 10% (100,000), points used as given. */
    private UUID booking(long pointsUsed) {
        String ref = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, ref);
        UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref").param("ref", ref).query(UUID.class).single();
        long total = 900_000 + 72_000 - pointsUsed;
        jdbc.sql("""
                UPDATE reservation SET customer_id = :c, subtotal_minor = 1000000, discount_minor = 0,
                       tax_minor = 72000, total_minor = :total, sales_status = 'PAYMENT_PENDING'
                 WHERE id = :id
                """).param("c", customerId).param("total", total).param("id", id).update();
        jdbc.sql("""
                INSERT INTO reservation_loyalty_snapshot
                    (reservation_id, customer_membership_id, tier_id, tier_code_snapshot, member_discount_percent,
                     member_discount_base_minor, member_discount_minor, cashback_rate_percent_snapshot,
                     cashback_redeemed_points, member_eligible_at_booking)
                SELECT :id, cm.id, :tier, 'GOLD', 10, 1000000, 100000, 2, :points, true
                  FROM customer_membership cm WHERE cm.customer_id = :c
                """).param("id", id).param("tier", goldTierId).param("points", pointsUsed).param("c", customerId).update();
        return id;
    }

    private long[] account() {
        return jdbc.sql("SELECT balance_points, reserved_points FROM cashback_account WHERE customer_id = :c")
                .param("c", customerId).query((rs, n) -> new long[] {rs.getLong(1), rs.getLong(2)}).single();
    }

    private String reference(UUID id) {
        return jdbc.sql("SELECT reference FROM reservation WHERE id = :id").param("id", id).query(String.class).single();
    }

    private long ledger(UUID reservationId, String type) {
        return jdbc.sql("SELECT count(*) FROM cashback_ledger WHERE reservation_id = :r AND entry_type = CAST(:t AS cashback_entry_type)")
                .param("r", reservationId).param("t", type).query(Long.class).single();
    }

    @Test
    @DisplayName("points are held at booking, spent once on payment (a repeated IPN spends nothing more)")
    void holdThenSpendOnce() {
        UUID id = booking(200_000);
        assertThat(points.hold(customerId, id, 200_000, OffsetDateTime.now().plusDays(5))).isTrue();
        assertThat(account()).containsExactly(500_000, 200_000);
        assertThat(points.hold(customerId, booking(400_000), 400_000, OffsetDateTime.now().plusDays(5)))
                .as("only 300,000 left free").isFalse();

        actions.confirmPaymentByGateway(reference(id), 772_000, "VND", "SEPAY-P1", "BANK_TRANSFER");
        assertThat(account()).containsExactly(300_000, 0);
        actions.confirmPaymentByGateway(reference(id), 772_000, "VND", "SEPAY-P1", "BANK_TRANSFER");
        points.consume(id);
        assertThat(account()).containsExactly(300_000, 0);
        assertThat(ledger(id, "REDEEM")).isEqualTo(1);
    }

    @Test
    @DisplayName("a booking that ends unpaid frees its held points")
    void unpaidReleases() {
        UUID id = booking(100_000);
        points.hold(customerId, id, 100_000, OffsetDateTime.now().plusDays(5));
        jdbc.sql("UPDATE reservation SET sales_status = 'DECLINED' WHERE id = :id").param("id", id).update();
        assertThat(points.sweep()).isPositive();
        assertThat(account()).containsExactly(500_000, 0);
        assertThat(ledger(id, "REDEEM")).isZero();
    }

    @Test
    @DisplayName("a paid booking cancelled later gets its points back, once")
    void paidCancelledReturns() {
        UUID id = booking(150_000);
        points.hold(customerId, id, 150_000, OffsetDateTime.now().plusDays(5));
        actions.confirmPaymentByGateway(reference(id), 822_000, "VND", "SEPAY-P2", "BANK_TRANSFER");
        assertThat(account()[0]).isEqualTo(350_000);
        jdbc.sql("UPDATE reservation SET stay_status = 'CANCELLED' WHERE id = :id").param("id", id).update();
        points.sweep();
        points.sweep();
        assertThat(account()[0]).isEqualTo(500_000);
        assertThat(ledger(id, "REVERSAL")).isEqualTo(1);
    }

    @Test
    @DisplayName("points earned after a paid check-out at the booking-time rate, on the room amount actually paid; undo takes them back")
    void earnAfterCheckout() {
        UUID id = booking(0);
        actions.confirmPaymentByGateway(reference(id), 972_000, "VND", "SEPAY-P3", "BANK_TRANSFER");
        assertThat(points.earnForCheckout(id)).as("not checked out yet").isZero();
        jdbc.sql("UPDATE reservation SET stay_status = 'CHECKED_OUT' WHERE id = :id").param("id", id).update();
        // Gold 2% of (1,000,000 − 100,000 member discount) = 18,000; VAT never earns.
        assertThat(points.earnForCheckout(id)).isEqualTo(18_000);
        assertThat(points.earnForCheckout(id)).as("once").isZero();
        assertThat(account()[0]).isEqualTo(518_000);
        points.reverseEarn(id);
        assertThat(account()[0]).isEqualTo(500_000);
    }

    @Test
    @DisplayName("nothing is earned for an unpaid stay")
    void noEarnWhenUnpaid() {
        UUID id = booking(0);
        jdbc.sql("UPDATE reservation SET sales_status = 'WON', stay_status = 'CHECKED_OUT' WHERE id = :id").param("id", id).update();
        assertThat(points.earnForCheckout(id)).isZero();
        assertThat(ledger(id, "EARN")).isZero();
    }
}
