package com.kas.platform.customer;

import com.kas.platform.shared.EmailLanguage;
import com.kas.platform.shared.EmailOutboxService;
import com.kas.platform.shared.TimeConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Membership tier review (owner decisions 2026-11-09; V59).
 *
 * <h2>Rules</h2>
 * <ul>
 *   <li>A booking counts once when it was made on the KAS website by a member signed in at the
 *       time ({@code lead_source = WEBSITE}, a customer and {@code member_eligible_at_booking}),
 *       and the stay is checked out. Phone bookings, guest bookings, cancellations and no-shows
 *       never count; nights and rooms do not matter.</li>
 *   <li>The quarter is the one of the booking's check-out date (Vietnam).</li>
 *   <li>Entitled tier at any moment = the higher of the start-of-quarter base (the review result)
 *       and the tier the current quarter's count reaches (Gold 15, Platinum 30).</li>
 *   <li>On check-out the tier rises to the entitled tier if that is higher (email). The booking
 *       just checked out keeps the tier recorded when it was booked.</li>
 *   <li>When a counted booking is reversed (check-out undone) and the count falls below the
 *       threshold, the tier drops to the entitled tier at once (owner: "hạ hạng ngay").</li>
 *   <li>At the start of each quarter every member gets the tier the previous quarter's count
 *       reaches, never below Classic (email when it changes).</li>
 * </ul>
 */
@Service
public class MembershipTierService {

    private static final Logger log = LoggerFactory.getLogger(MembershipTierService.class);

    /** Why a tier changed: drives the history reason and which email is sent. */
    public enum Change { UPGRADE, REVERSAL, QUARTER_REVIEW }

    private record Tier(UUID id, String code, int rank, int threshold, String nameVi, String nameEn) { }

    private final JdbcClient jdbc;
    private final EmailOutboxService outbox;
    private final Clock clock;
    private final String siteBase;

    public MembershipTierService(JdbcClient jdbc, EmailOutboxService outbox, Clock clock,
                                 @Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBase) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.clock = clock;
        this.siteBase = siteBase.replaceAll("/+$", "");
    }

    // ------------------------------------------------------------------ public API

    /**
     * Called in the check-out transaction. Records the booking when it qualifies and raises the
     * member's tier if the quarter now reaches a threshold. Returns whether it was counted.
     */
    @Transactional
    public boolean recordCheckout(UUID reservationId, UUID actorId) {
        Optional<Qualifying> found = jdbc.sql("""
                        SELECT s.customer_membership_id AS membership_id, r.check_out
                          FROM reservation r
                          JOIN reservation_loyalty_snapshot s ON s.reservation_id = r.id
                          JOIN customer_membership cm ON cm.id = s.customer_membership_id AND cm.status = 'ACTIVE'
                         WHERE r.id = :id
                           AND r.channel_type = 'DIRECT'
                           AND r.lead_source = 'WEBSITE'
                           AND r.customer_id IS NOT NULL
                           AND s.member_eligible_at_booking
                           AND r.stay_status IN ('CHECKED_OUT', 'COMPLETED')
                        """)
                .param("id", reservationId)
                .query((rs, n) -> new Qualifying(rs.getObject("membership_id", UUID.class),
                        rs.getObject("check_out", LocalDate.class)))
                .optional();
        if (found.isEmpty()) return false;
        Qualifying q = found.get();
        jdbc.sql("""
                        INSERT INTO membership_qualifying_booking (membership_id, reservation_id, quarter_start, checkout_date)
                        VALUES (:membership, :reservation, :quarter, :checkout)
                        ON CONFLICT (reservation_id) DO UPDATE
                           SET reversed_at = NULL, reversal_reason = NULL, counted_at = now()
                         WHERE membership_qualifying_booking.reversed_at IS NOT NULL
                        """)
                .param("membership", q.membershipId())
                .param("reservation", reservationId)
                .param("quarter", quarterStart(q.checkout()))
                .param("checkout", q.checkout())
                .update();
        reconcile(q.membershipId(), Change.UPGRADE, actorId);
        return true;
    }

    /**
     * Called when a check-out is undone: the booking stops counting and, if the quarter falls
     * below the member's threshold, the tier drops at once. No email (a correction).
     */
    @Transactional
    public void reverseCheckout(UUID reservationId, String reason, UUID actorId) {
        jdbc.sql("""
                        UPDATE membership_qualifying_booking
                           SET reversed_at = now(), reversal_reason = :reason
                         WHERE reservation_id = :id AND reversed_at IS NULL
                        RETURNING membership_id
                        """)
                .param("id", reservationId)
                .param("reason", reason)
                .query(UUID.class)
                .optional()
                .ifPresent(membership -> reconcile(membership, Change.REVERSAL, actorId));
    }

    /** Upgrades every member whose counted bookings already reach a higher tier (start-up). */
    @Transactional
    public int upgradeAll() {
        int changed = 0;
        for (UUID membership : activeMemberships()) {
            if (reconcile(membership, Change.UPGRADE, null)) changed++;
        }
        return changed;
    }

    /**
     * The start-of-quarter review for the quarter containing today. Idempotent: a member already
     * reviewed for that quarter is skipped.
     */
    @Transactional
    public int reviewCurrentQuarter() {
        LocalDate quarter = quarterStart(today());
        LocalDate previous = quarter.minusMonths(3);
        int changed = 0;
        for (UUID membership : jdbc.sql("""
                        SELECT cm.id FROM customer_membership cm
                         WHERE cm.status = 'ACTIVE'
                           AND NOT EXISTS (SELECT 1 FROM membership_quarter_review q
                                            WHERE q.membership_id = cm.id AND q.quarter_start = :quarter)
                        """).param("quarter", quarter).query(UUID.class).list()) {
            int previousCount = count(membership, previous);
            Tier base = tierFor(previousCount);
            Tier current = currentTier(membership).orElse(base);
            Tier entitled = higher(base, tierFor(count(membership, quarter)));
            int inserted = jdbc.sql("""
                            INSERT INTO membership_quarter_review
                                (membership_id, quarter_start, previous_tier_id, base_tier_id, previous_quarter_bookings)
                            VALUES (:membership, :quarter, :previous, :base, :count)
                            ON CONFLICT DO NOTHING
                            """)
                    .param("membership", membership).param("quarter", quarter)
                    .param("previous", current.id()).param("base", base.id()).param("count", previousCount)
                    .update();
            if (inserted == 1 && !entitled.id().equals(current.id())) {
                changeTier(membership, current, entitled, Change.QUARTER_REVIEW, null,
                        "Quarter review " + quarter + ": " + previousCount + " qualifying bookings last quarter");
                changed++;
            }
        }
        return changed;
    }

    /** The member's progress this quarter, for My KAS. */
    public Optional<Progress> progress(UUID membershipId) {
        Optional<Tier> current = currentTier(membershipId);
        if (current.isEmpty()) return Optional.empty();
        LocalDate quarter = quarterStart(today());
        int count = count(membershipId, quarter);
        Optional<Tier> next = tiers().stream().filter(t -> t.threshold() > count && t.rank() > current.get().rank())
                .findFirst();
        return Optional.of(new Progress(current.get().code(), quarter, quarter.plusMonths(3).minusDays(1), count,
                next.map(Tier::code).orElse(null),
                next.map(t -> Math.max(0, t.threshold() - count)).orElse(null)));
    }

    public record Progress(String tierCode, LocalDate quarterStart, LocalDate quarterEnd, int qualifyingBookings,
                           String nextTierCode, Integer bookingsToNextTier) { }

    // ------------------------------------------------------------------ internals

    private record Qualifying(UUID membershipId, LocalDate checkout) { }

    /** Moves the member to the entitled tier. UPGRADE only raises; REVERSAL only lowers. */
    private boolean reconcile(UUID membership, Change change, UUID actorId) {
        Optional<Tier> currentTier = currentTier(membership);
        if (currentTier.isEmpty()) return false;
        Tier current = currentTier.get();
        LocalDate quarter = quarterStart(today());
        int count = count(membership, quarter);
        Tier entitled = higher(base(membership, quarter), tierFor(count));
        boolean raise = entitled.rank() > current.rank();
        boolean lower = entitled.rank() < current.rank();
        if ((change == Change.UPGRADE && raise) || (change == Change.REVERSAL && lower)) {
            changeTier(membership, current, entitled, change, actorId,
                    (change == Change.UPGRADE ? "Upgrade: " : "Check-out undone: ")
                            + count + " qualifying bookings in quarter " + quarter);
            return true;
        }
        return false;
    }

    private void changeTier(UUID membership, Tier from, Tier to, Change change, UUID actorId, String reason) {
        OffsetDateTime at = OffsetDateTime.now(clock);
        jdbc.sql("UPDATE customer_membership_tier_history SET effective_to = :at WHERE membership_id = :m AND effective_to IS NULL")
                .param("at", at).param("m", membership).update();
        UUID historyId = jdbc.sql("""
                        INSERT INTO customer_membership_tier_history
                            (membership_id, tier_id, effective_from, assigned_by, change_reason)
                        VALUES (:m, :tier, :at, :by, :reason) RETURNING id
                        """)
                .param("m", membership).param("tier", to.id()).param("at", at).param("by", actorId).param("reason", reason)
                .query(UUID.class).single();
        log.info("membership tier changed membership={} from={} to={} change={}", membership, from.code(), to.code(), change);
        if (change != Change.REVERSAL) notify(membership, historyId, from, to, change);
    }

    /** Bilingual email in the guest's language (nationality, like every other guest email). */
    private void notify(UUID membership, UUID historyId, Tier from, Tier to, Change change) {
        jdbc.sql("""
                        SELECT c.email::text AS email, c.full_name, c.country, c.customer_code
                          FROM customer_membership cm JOIN customer c ON c.id = cm.customer_id
                         WHERE cm.id = :m AND c.email IS NOT NULL
                        """)
                .param("m", membership)
                .query((rs, n) -> new String[] {rs.getString("email"), rs.getString("full_name"),
                        rs.getString("country"), rs.getString("customer_code")})
                .optional()
                .ifPresent(guest -> {
                    boolean vi = "vi".equals(EmailLanguage.forCountry(guest[2]));
                    String template = change == Change.QUARTER_REVIEW ? "MEMBER_TIER_QUARTER_REVIEW" : "MEMBER_TIER_UPGRADED";
                    outbox.template("member-tier-" + historyId, template, guest[2], guest[0], guest[1], Map.of(
                            "firstName", guest[1] == null ? "" : guest[1],
                            "memberId", guest[3] == null ? "" : guest[3],
                            "previousTier", vi ? from.nameVi() : from.nameEn(),
                            "newTier", vi ? to.nameVi() : to.nameEn(),
                            "accountUrl", siteBase + "/manage-booking.html",
                            "policyUrl", siteBase + "/offers.html#tiers"));
                });
    }

    private List<UUID> activeMemberships() {
        return jdbc.sql("SELECT id FROM customer_membership WHERE status = 'ACTIVE'").query(UUID.class).list();
    }

    private int count(UUID membership, LocalDate quarter) {
        return jdbc.sql("""
                        SELECT count(*) FROM membership_qualifying_booking
                         WHERE membership_id = :m AND quarter_start = :q AND reversed_at IS NULL
                        """)
                .param("m", membership).param("q", quarter).query(Integer.class).single();
    }

    /** The start-of-quarter floor: the review result if reviewed, else what last quarter reached. */
    private Tier base(UUID membership, LocalDate quarter) {
        Optional<UUID> reviewed = jdbc.sql("SELECT base_tier_id FROM membership_quarter_review WHERE membership_id = :m AND quarter_start = :q")
                .param("m", membership).param("q", quarter).query(UUID.class).optional();
        if (reviewed.isPresent()) {
            return tiers().stream().filter(t -> t.id().equals(reviewed.get())).findFirst()
                    .orElseGet(() -> tierFor(0));
        }
        return tierFor(count(membership, quarter.minusMonths(3)));
    }

    private Optional<Tier> currentTier(UUID membership) {
        Optional<UUID> id = jdbc.sql("SELECT tier_id FROM customer_membership_tier_history WHERE membership_id = :m AND effective_to IS NULL")
                .param("m", membership).query(UUID.class).optional();
        return id.flatMap(value -> tiers().stream().filter(t -> t.id().equals(value)).findFirst());
    }

    /** Active tiers that qualify on completed bookings, lowest first. */
    private List<Tier> tiers() {
        return jdbc.sql("""
                        SELECT t.id, t.code, t.sort_order, coalesce(t.qualifying_completed_bookings, 0) AS threshold,
                               coalesce(vi.display_name, t.code) AS name_vi, coalesce(en.display_name, t.code) AS name_en
                          FROM membership_tier t
                          LEFT JOIN membership_tier_translation vi ON vi.tier_id = t.id AND vi.locale = 'vi'
                          LEFT JOIN membership_tier_translation en ON en.tier_id = t.id AND en.locale = 'en'
                         WHERE t.status = 'ACTIVE'
                         ORDER BY t.sort_order, threshold
                        """)
                .query((rs, n) -> new Tier(rs.getObject("id", UUID.class), rs.getString("code"), rs.getInt("sort_order"),
                        rs.getInt("threshold"), rs.getString("name_vi"), rs.getString("name_en")))
                .list();
    }

    private Tier tierFor(int count) {
        List<Tier> all = tiers();
        Tier best = all.get(0);
        for (Tier tier : all) if (tier.threshold() <= count && tier.rank() >= best.rank()) best = tier;
        return best;
    }

    private static Tier higher(Tier a, Tier b) {
        return b.rank() > a.rank() ? b : a;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(TimeConfiguration.PROPERTY_ZONE));
    }

    static LocalDate quarterStart(LocalDate date) {
        return LocalDate.of(date.getYear(), ((date.getMonthValue() - 1) / 3) * 3 + 1, 1);
    }
}
