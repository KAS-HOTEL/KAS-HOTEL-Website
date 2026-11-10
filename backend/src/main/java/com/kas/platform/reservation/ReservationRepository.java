package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Writes the reservation, its lines and its status history for S1.
 *
 * <p>Every value this writes is either supplied by the frozen request, computed
 * by {@code inventory}/{@code pricing}, or fixed by the contract. Nothing is
 * defaulted into existence.
 */
@Repository
public class ReservationRepository {

    private final JdbcClient jdbc;

    public ReservationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The {@code DIRECT} channel row. Absent means the reference data is missing. */
    public Optional<UUID> directChannelId() {
        return jdbc.sql("SELECT id FROM distribution_channel WHERE code = 'DIRECT'")
                .query(UUID.class)
                .optional();
    }

    /** Resolves an authenticated customer by the identity's immutable user id. */
    public Optional<UUID> customerIdForUser(UUID userId) {
        return jdbc.sql("SELECT id FROM customer WHERE user_id = :userId AND merged_into_id IS NULL")
                .param("userId", userId)
                .query(UUID.class)
                .optional();
    }

    /** Whether a reference is already taken. The UNIQUE constraint is the real guard. */
    public boolean referenceExists(String reference) {
        return jdbc.sql("SELECT count(*) FROM reservation WHERE reference = :reference")
                .param("reference", reference)
                .query(Integer.class)
                .single() > 0;
    }

    /**
     * The property's two-digit branch code — the middle of every new reference.
     *
     * <p>Empty when the property has none (V31 leaves the column nullable for
     * properties created after it). The caller turns that into a
     * {@code CONFIG_MISSING} refusal rather than issuing a reference that cannot
     * name its hotel.
     *
     * <p>Unscoped, like {@code directChannelId} beside it: this runs inside S1,
     * after the property has already been resolved and its availability checked,
     * so the id is established rather than caller-supplied.
     */
    public Optional<String> branchCodeOf(UUID propertyId) {
        return jdbc.sql("SELECT branch_code FROM property WHERE id = :id")
                .param("id", propertyId)
                .query(String.class)
                .optional();
    }

    /**
     * The S1 insert.
     *
     * <p>Fixed by contract, not by choice:
     * <ul>
     *   <li>{@code channel_type = 'DIRECT'} and {@code lead_source = 'WEBSITE'} —
     *       doc 58:157, server-set, never client-supplied.</li>
     *   <li>{@code sales_status = 'REQUESTED'} — the S1 target state. V12's
     *       {@code reservation_direct_has_status} CHECK requires DIRECT to carry
     *       one.</li>
     *   <li>{@code stay_status} stays NULL — doc 05: <em>"NULL until
     *       confirmed"</em>. CONFIRMED belongs to S10.</li>
     *   <li>{@code customer_id} is set only for an authenticated CUSTOMER.
     *       Anonymous requests remain unlinked; an authenticated reservation is
     *       linked by account identity, never by matching guest email.</li>
     *   <li>{@code tax_minor} and {@code service_charge_minor} stay NULL — doc 117
     *       §14.2 removed tax from the V1 snapshot, and V1 has no tax step.</li>
     *   <li>{@code discount_minor} takes its schema default of 0 — an offer code
     *       is refused before this point (doc 117 §13).</li>
     *   <li>{@code terms_version} stores the client string verbatim and
     *       unvalidated — OQ-167, closed by doc 117 §24.2.</li>
     * </ul>
     */
    /** Records the voucher discount and the taxes/charges priced at S1 on the new reservation. */
    public void recordAdjustment(UUID reservationId, long discountMinor, long taxMinor,
                                 long serviceChargeMinor, UUID voucherId) {
        jdbc.sql("""
                UPDATE reservation SET discount_minor = :discount, tax_minor = :tax,
                       service_charge_minor = :service, voucher_id = :voucherId
                 WHERE id = :id
                """).param("discount", discountMinor).param("tax", taxMinor)
                .param("service", serviceChargeMinor).param("voucherId", voucherId)
                .param("id", reservationId).update();
    }

    /** Freezes the member discount, the tier cashback rate and the points spent on the booking's snapshot. */
    public void recordMemberPricing(UUID reservationId, UUID policyId, java.math.BigDecimal percent, long baseMinor,
                                    long discountMinor, java.math.BigDecimal cashbackRate, long pointsUsed) {
        jdbc.sql("""
                UPDATE reservation_loyalty_snapshot
                   SET discount_policy_id = :policy, member_discount_percent = :percent,
                       member_discount_base_minor = :base, member_discount_minor = :discount,
                       cashback_rate_percent_snapshot = :rate, cashback_redeemed_points = :points
                 WHERE reservation_id = :id AND customer_membership_id IS NOT NULL
                """).param("policy", policyId).param("percent", percent).param("base", baseMinor)
                .param("discount", discountMinor).param("rate", cashbackRate).param("points", pointsUsed)
                .param("id", reservationId).update();
    }

    public void insertReservation(UUID id, String reference, UUID propertyId, UUID channelId,
                                  UUID customerId,
                                  LocalDate checkIn, LocalDate checkOut, int adults, int children,
                                  String guestName, String guestEmail, String guestPhone,
                                  String guestCountry, String preferredChannel,
                                  String specialRequests, String discoveryChannel,
                                  String termsVersion, String currency, Long subtotalMinor,
                                  Long totalMinor, String priceSnapshotJson,
                                  OffsetDateTime requestedAt, OffsetDateTime slaDueAt) {
        jdbc.sql("""
                        INSERT INTO reservation (
                            id, reference, property_id, customer_id, distribution_channel_id, channel_type,
                            lead_source, sales_status, check_in, check_out, adults, children,
                            guest_name, guest_email, guest_phone, guest_country, preferred_channel,
                            special_requests, discovery_channel, terms_version,
                            currency, subtotal_minor, total_minor, price_snapshot,
                            requested_at, sla_due_at)
                        VALUES (
                            :id, :reference, :propertyId, :customerId, :channelId, 'DIRECT',
                            'WEBSITE', 'REQUESTED', :checkIn, :checkOut, :adults, :children,
                            :guestName, :guestEmail, :guestPhone, :guestCountry,
                            CAST(:preferredChannel AS contact_channel),
                            :specialRequests, :discoveryChannel, :termsVersion,
                            :currency, :subtotalMinor, :totalMinor, CAST(:priceSnapshot AS jsonb),
                            :requestedAt, :slaDueAt)
                        """)
                .param("id", id)
                .param("reference", reference)
                .param("propertyId", propertyId)
                .param("customerId", customerId)
                .param("channelId", channelId)
                .param("checkIn", java.sql.Date.valueOf(checkIn))
                .param("checkOut", java.sql.Date.valueOf(checkOut))
                .param("adults", (short) adults)
                .param("children", (short) children)
                .param("guestName", guestName)
                .param("guestEmail", guestEmail)
                .param("guestPhone", guestPhone)
                .param("guestCountry", guestCountry)
                .param("preferredChannel", preferredChannel)
                .param("specialRequests", specialRequests)
                .param("discoveryChannel", discoveryChannel)
                .param("termsVersion", termsVersion)
                .param("currency", currency)
                .param("subtotalMinor", subtotalMinor)
                .param("totalMinor", totalMinor)
                .param("priceSnapshot", priceSnapshotJson)
                .param("requestedAt", requestedAt)
                .param("slaDueAt", slaDueAt)
                .update();
    }

    /**
     * Records membership eligibility as it existed when an authenticated
     * customer submitted the reservation. Later suspension or tier changes do
     * not rewrite the booking-time cancellation entitlement.
     */
    public void insertMembershipSnapshot(UUID reservationId, UUID customerId,
                                         String currency, OffsetDateTime bookedAt) {
        jdbc.sql("""
                        INSERT INTO reservation_loyalty_snapshot
                            (reservation_id, customer_membership_id, tier_id,
                             tier_code_snapshot, currency, member_eligible_at_booking)
                        SELECT :reservationId, cm.id, mt.id, mt.code, :currency,
                               (cm.id IS NOT NULL)
                          FROM customer c
                          LEFT JOIN customer_membership cm
                                 ON cm.customer_id = c.id
                                AND cm.status = 'ACTIVE'
                          LEFT JOIN customer_membership_tier_history th
                                 ON th.membership_id = cm.id
                                AND th.effective_from <= :bookedAt
                                AND (th.effective_to IS NULL OR th.effective_to > :bookedAt)
                          LEFT JOIN membership_tier mt
                                 ON mt.id = th.tier_id AND mt.status = 'ACTIVE'
                         WHERE c.id = :customerId
                        """)
                .param("reservationId", reservationId)
                .param("customerId", customerId)
                .param("currency", currency)
                .param("bookedAt", bookedAt)
                .update();
    }

    /**
     * One line per room type — V12: <em>"Same room type, several rooms = ONE line
     * with quantity N, not N lines."</em>
     *
     * <p>{@code nightlyPriceMinor} carries the line's nightly rate <em>only when
     * every night of that line shares one rate</em>, and is NULL otherwise — doc
     * 125 §9, which forbids a first / lowest / highest / average stand-in because
     * a figure equal to no night actually charged is worse than an absent one. Doc
     * 56 §5.3.4 treats the column as a denormalised rendering copy; the
     * authoritative per-night detail is {@code price_snapshot.lines[].nights[]}
     * (doc 125 §10). The caller decides uniformity; this method only stores it.
     */
    public void insertLine(UUID reservationId, UUID roomTypeId, int quantity,
                           String roomTypeNameSnapshot, Long nightlyPriceMinor,
                           Long lineTotalMinor) {
        jdbc.sql("""
                        INSERT INTO reservation_line (reservation_id, room_type_id, quantity,
                                                      room_type_name_snapshot,
                                                      nightly_price_minor, line_total_minor)
                        VALUES (:reservationId, :roomTypeId, :quantity, :name,
                                :nightlyPrice, :lineTotal)
                        """)
                .param("reservationId", reservationId)
                .param("roomTypeId", roomTypeId)
                .param("quantity", quantity)
                .param("name", roomTypeNameSnapshot)
                .param("nightlyPrice", nightlyPriceMinor)
                .param("lineTotal", lineTotalMinor)
                .update();
    }

    /**
     * The S1 history row.
     *
     * <p>{@code field = 'SALES'} because S1 moves {@code sales_status};
     * {@code from_status} is NULL because the reservation did not exist;
     * {@code actor_type = 'CUSTOMER'} with a NULL {@code actor_id}, which is what
     * an anonymous guest is — V14 admits exactly these three actor types.
     */
    public void insertS1History(UUID reservationId) {
        jdbc.sql("""
                        INSERT INTO reservation_status_history (reservation_id, field, from_status,
                                                                to_status, actor_type, note,
                                                                created_at)
                        VALUES (:reservationId, 'SALES', NULL, 'REQUESTED', 'CUSTOMER',
                                'Guest submitted a direct reservation request (S1).',
                                clock_timestamp())
                        """)
                .param("reservationId", reservationId)
                .update();
    }
}
