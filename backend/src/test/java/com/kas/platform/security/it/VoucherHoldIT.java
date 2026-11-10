package com.kas.platform.security.it;

import com.kas.platform.reservation.ReservationEmailActionService;
import com.kas.platform.reservation.VoucherHoldService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A voucher counts as used only once the booking is paid (V65, owner request 2026-11-10).
 * Rolled back.
 */
class VoucherHoldIT extends SecurityIntegrationTest {

    @Autowired JdbcClient jdbc;
    @Autowired VoucherHoldService holds;
    @Autowired ReservationEmailActionService actions;

    private UUID propertyId;
    private UUID voucherId;

    @BeforeEach
    void prepare() {
        UUID partner = fixtures.createPartner("voucher-hold");
        propertyId = fixtures.createProperties(partner, 1).getFirst();
        voucherId = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO voucher (id, code, name, voucher_type, value_percent, usage_limit_total, status)
                VALUES (:id, :code, 'Hold test', 'PERCENTAGE', 10, 1, 'ACTIVE')
                """).param("id", voucherId).param("code", "KAS-HOLD" + UUID.randomUUID().toString().substring(0, 6))
                .update();
    }

    /** A pending booking that used the voucher, waiting for payment. */
    private UUID booking() {
        String ref = "TEST-" + UUID.randomUUID().toString().substring(0, 8);
        fixtures.insertRawReservation(propertyId, ref);
        UUID id = jdbc.sql("SELECT id FROM reservation WHERE reference = :ref").param("ref", ref).query(UUID.class).single();
        jdbc.sql("""
                UPDATE reservation SET voucher_id = :v, discount_minor = 100000, subtotal_minor = 1000000,
                       total_minor = 972000, sales_status = 'PAYMENT_PENDING'
                 WHERE id = :id
                """).param("v", voucherId).param("id", id).update();
        return id;
    }

    private int usedCount() {
        return jdbc.sql("SELECT used_count FROM voucher WHERE id = :id").param("id", voucherId).query(Integer.class).single();
    }

    private String holdStatus(UUID reservationId) {
        return jdbc.sql("SELECT status FROM voucher_hold WHERE reservation_id = :id").param("id", reservationId)
                .query(String.class).optional().orElse("NONE");
    }

    private String reference(UUID reservationId) {
        return jdbc.sql("SELECT reference FROM reservation WHERE id = :id").param("id", reservationId)
                .query(String.class).single();
    }

    private static OffsetDateTime later() {
        return OffsetDateTime.now().plusDays(10);
    }

    @Test
    @DisplayName("a booking only holds the use: used_count stays, and the last use cannot be held twice")
    void holdCountsWithoutUsing() {
        UUID first = booking();
        UUID second = booking();
        assertThat(holds.hold(voucherId, first, null, 100_000, later())).isTrue();
        assertThat(usedCount()).isZero();
        assertThat(holds.hold(voucherId, second, null, 100_000, later()))
                .as("limit 1, one active hold: the second booking is refused").isFalse();
    }

    @Test
    @DisplayName("payment verified: the hold becomes the redemption and used_count goes up exactly once")
    void paymentConsumesOnce() {
        UUID id = booking();
        holds.hold(voucherId, id, null, 100_000, later());
        var first = actions.confirmPaymentByGateway(reference(id), 972_000, "VND", "SEPAY-T1", "BANK_TRANSFER");
        assertThat(first.match()).isEqualTo(ReservationEmailActionService.GatewayMatch.CONFIRMED);
        assertThat(usedCount()).isEqualTo(1);
        assertThat(holdStatus(id)).isEqualTo("CONSUMED");

        // The same IPN again, and a second consume: nothing more is counted.
        var again = actions.confirmPaymentByGateway(reference(id), 972_000, "VND", "SEPAY-T1", "BANK_TRANSFER");
        assertThat(again.match()).isEqualTo(ReservationEmailActionService.GatewayMatch.ALREADY_PAID);
        assertThat(holds.consume(id)).isFalse();
        assertThat(usedCount()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM voucher_redemption WHERE reservation_id = :id").param("id", id)
                .query(Long.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("a booking that ends unpaid gives the use back")
    void unpaidEndReleases() {
        UUID first = booking();
        holds.hold(voucherId, first, null, 100_000, later());
        jdbc.sql("UPDATE reservation SET sales_status = 'CANCELLED' WHERE id = :id").param("id", first).update();
        assertThat(holds.sweep()).isPositive();
        assertThat(holdStatus(first)).isEqualTo("RELEASED");
        assertThat(holds.hold(voucherId, booking(), null, 100_000, later())).as("the use is free again").isTrue();
        assertThat(usedCount()).isZero();
    }

    @Test
    @DisplayName("a hold past its time expires and frees the use")
    void expiredHoldFrees() {
        UUID first = booking();
        holds.hold(voucherId, first, null, 100_000, OffsetDateTime.now().minusMinutes(1));
        assertThat(holds.hold(voucherId, booking(), null, 100_000, later()))
                .as("an expired hold no longer counts").isTrue();
        holds.sweep();
        assertThat(holdStatus(first)).isEqualTo("EXPIRED");
    }

    @Test
    @DisplayName("a paid booking cancelled later keeps its redemption: the use is not given back")
    void paidThenCancelledKeepsRedemption() {
        UUID id = booking();
        holds.hold(voucherId, id, null, 100_000, later());
        actions.confirmPaymentByGateway(reference(id), 972_000, "VND", "SEPAY-T2", "BANK_TRANSFER");
        jdbc.sql("UPDATE reservation SET stay_status = 'CANCELLED' WHERE id = :id").param("id", id).update();
        holds.release(id, "TEST");
        holds.sweep();
        assertThat(holdStatus(id)).isEqualTo("CONSUMED");
        assertThat(usedCount()).isEqualTo(1);
        assertThat(holds.hold(voucherId, booking(), null, 100_000, later())).as("still used up").isFalse();
    }

    @Test
    @DisplayName("the per-guest limit counts that guest's redemptions and active holds")
    void perGuestLimit() {
        jdbc.sql("UPDATE voucher SET usage_limit_total = NULL, usage_limit_per_customer = 1 WHERE id = :id")
                .param("id", voucherId).update();
        UUID customer = jdbc.sql("""
                INSERT INTO customer (full_name, email, customer_code) VALUES ('Hold Guest', :e, :code) RETURNING id
                """).param("e", "hold-" + UUID.randomUUID() + "@example.invalid")
                .param("code", "KAS-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase())
                .query(UUID.class).single();
        assertThat(holds.hold(voucherId, booking(), customer, 100_000, later())).isTrue();
        assertThat(holds.hold(voucherId, booking(), customer, 100_000, later())).isFalse();
        assertThat(holds.hold(voucherId, booking(), null, 100_000, later())).as("another guest").isTrue();
    }
}
