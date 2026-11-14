package com.kas.platform.reservation;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.reservation.api.StayTransitionView;
import com.kas.platform.settings.SettingKey;
import com.kas.platform.settings.SystemSettingService;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.TimeConfiguration;
import com.kas.platform.shared.scope.ScopeFilter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;

/** Date and cutoff guarded transitions for the operational stay lifecycle. */
@Service
public class StayTransitionService {
    private final JdbcClient jdbc;
    private final AuditLogger audit;
    private final SystemSettingService settings;
    private final Clock clock;
    private final com.kas.platform.customer.MembershipTierService tiers;
    private final com.kas.platform.customer.LoyaltyPointsService loyaltyPoints;

    public StayTransitionService(JdbcClient jdbc, AuditLogger audit,
                                 SystemSettingService settings, Clock clock,
                                 com.kas.platform.customer.MembershipTierService tiers,
                                 com.kas.platform.customer.LoyaltyPointsService loyaltyPoints) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.settings = settings;
        this.clock = clock;
        this.tiers = tiers;
        this.loyaltyPoints = loyaltyPoints;
    }

    @Transactional
    public StayTransitionView transition(String reference, Action action, ResolvedActor actor) {
        var scope = actor.scope();
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        var rows = jdbc.sql("""
                        SELECT r.id, r.stay_status::text AS stay_status, r.check_in, r.check_out
                          FROM reservation r JOIN property p ON p.id = r.property_id
                         WHERE r.reference = ? AND %s
                         FOR UPDATE OF r
                        """.formatted(filter.sql()))
                .params(join(reference, filter.parameters()))
                .query((rs, row) -> new StayRow(rs.getObject("id", UUID.class),
                        rs.getString("stay_status"), rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class)))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Reservation"));

        String from = rows.stayStatus();
        String to = action.toStatus;
        LocalDate today = LocalDate.now(clock.withZone(TimeConfiguration.PROPERTY_ZONE));
        if (!allowed(from, action) || (action == Action.CHECK_IN && today.isBefore(rows.checkIn()))
                || (action == Action.CHECK_OUT && today.isBefore(rows.checkOut()))) {
            throw ConflictException.illegalTransition("stayStatus", from, to);
        }
        if (action == Action.NO_SHOW) {
            LocalTime cutoff = cutoff();
            LocalTime localTime = LocalTime.now(clock.withZone(TimeConfiguration.PROPERTY_ZONE));
            if (!noShowWindowOpen(rows.checkIn(), today, localTime, cutoff)) {
                throw ConflictException.illegalTransition("stayStatus", from,
                        "NO_SHOW before configured cutoff");
            }
        }

        int updated = jdbc.sql("""
                        UPDATE reservation r SET stay_status = CAST(? AS stay_status)
                          FROM property p
                         WHERE r.id = ? AND p.id = r.property_id
                           AND r.stay_status = CAST(? AS stay_status) AND %s
                        """.formatted(filter.sql()))
                .params(join(to, rows.id(), from, filter.parameters())).update();
        if (updated != 1) {
            throw ConflictException.illegalTransition("stayStatus", from, to);
        }
        // V71: when the guest really arrived / left. A console button records the moment it is pressed.
        String timeSql = switch (action) {
            case CHECK_IN -> "UPDATE reservation SET checked_in_at = clock_timestamp() WHERE id = ?";
            case CHECK_OUT -> "UPDATE reservation SET checked_out_at = clock_timestamp() WHERE id = ?";
            case UNDO_CHECK_OUT -> "UPDATE reservation SET checked_out_at = NULL WHERE id = ?";
            case NO_SHOW -> null;
        };
        if (timeSql != null) jdbc.sql(timeSql).params(rows.id()).update();
        jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_id, actor_type,
                             reason, note, created_at)
                        VALUES (?, 'STAY', ?, ?, ?, 'ADMIN', ?, ?, clock_timestamp())
                        """)
                .params(rows.id(), from, to, actor.userId(), action.name(),
                        "Hotel staff manages room availability manually.").update();
        audit.record(new AuditEvent(actor.userId(), highestRole(actor), action.auditAction,
                "reservation", rows.id(), Map.of("stayStatus", from), Map.of("stayStatus", to),
                action.name(), null, null, CorrelationId.current(), scope.toString()));
        // Membership tier review (V59): a confirmed check-out counts the booking when it
        // qualifies; undoing it stops the count and may lower the tier at once.
        if (action == Action.CHECK_OUT) {
            tiers.recordCheckout(rows.id(), actor.userId());
            // KAS points (2026-11-10): earned once the paid stay is checked out.
            loyaltyPoints.earnForCheckout(rows.id());
        } else if (action == Action.UNDO_CHECK_OUT) {
            tiers.reverseCheckout(rows.id(), "Check-out undone by staff", actor.userId());
            loyaltyPoints.reverseEarn(rows.id());
        }
        return new StayTransitionView(reference, from, to);
    }

    /**
     * The "complete the stay" form (owner 2026-11-14). A stay nobody checked in before the
     * hotel's check-out time is NO_SHOW (StayAutoTransitionService); the only way back is this
     * form, which records the real check-in and check-out times and finishes the stay as
     * CHECKED_OUT, so it counts for the membership tier and KAS points like any check-out.
     * Also accepted for a confirmed stay the sweep has not reached yet.
     */
    @Transactional
    public StayTransitionView completeStay(String reference, java.time.OffsetDateTime checkedInAt,
                                           java.time.OffsetDateTime checkedOutAt, ResolvedActor actor) {
        var scope = actor.scope();
        ScopeFilter filter = ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        var rows = jdbc.sql("""
                        SELECT r.id, r.stay_status::text AS stay_status, r.check_in, r.check_out
                          FROM reservation r JOIN property p ON p.id = r.property_id
                         WHERE r.reference = ? AND %s
                         FOR UPDATE OF r
                        """.formatted(filter.sql()))
                .params(join(reference, filter.parameters()))
                .query((rs, row) -> new StayRow(rs.getObject("id", UUID.class),
                        rs.getString("stay_status"), rs.getObject("check_in", LocalDate.class),
                        rs.getObject("check_out", LocalDate.class)))
                .optional().orElseThrow(() -> NotFoundException.outOfScope("Reservation"));
        String from = rows.stayStatus();
        if (!java.util.Set.of("NO_SHOW", "CONFIRMED", "CHECK_IN_READY").contains(from)) {
            throw ConflictException.illegalTransition("stayStatus", from, "CHECKED_OUT");
        }
        java.util.List<com.kas.platform.shared.KasException.ErrorDetail> problems = new java.util.ArrayList<>();
        java.time.ZoneId zone = TimeConfiguration.PROPERTY_ZONE;
        if (checkedInAt == null) {
            problems.add(new com.kas.platform.shared.KasException.ErrorDetail("checkedInAt", "REQUIRED", "Nhập giờ check-in thực tế."));
        }
        if (checkedOutAt == null) {
            problems.add(new com.kas.platform.shared.KasException.ErrorDetail("checkedOutAt", "REQUIRED", "Nhập giờ check-out thực tế."));
        }
        if (checkedInAt != null && checkedOutAt != null) {
            if (!checkedOutAt.isAfter(checkedInAt)) {
                problems.add(new com.kas.platform.shared.KasException.ErrorDetail("checkedOutAt", "BEFORE_CHECK_IN",
                        "Giờ check-out phải sau giờ check-in."));
            }
            if (checkedInAt.atZoneSameInstant(zone).toLocalDate().isBefore(rows.checkIn())) {
                problems.add(new com.kas.platform.shared.KasException.ErrorDetail("checkedInAt", "BEFORE_ARRIVAL_DATE",
                        "Giờ check-in không được trước ngày nhận phòng của đơn."));
            }
            if (checkedOutAt.isAfter(java.time.OffsetDateTime.now(clock))) {
                problems.add(new com.kas.platform.shared.KasException.ErrorDetail("checkedOutAt", "IN_THE_FUTURE",
                        "Giờ check-out không được ở tương lai."));
            }
        }
        if (!problems.isEmpty()) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "The real check-in and check-out times are not valid.", problems);
        }
        int updated = jdbc.sql("""
                        UPDATE reservation SET stay_status = 'CHECKED_OUT', checked_in_at = ?, checked_out_at = ?
                         WHERE id = ? AND stay_status = CAST(? AS stay_status)
                        """)
                .params(checkedInAt, checkedOutAt, rows.id(), from).update();
        if (updated != 1) throw ConflictException.illegalTransition("stayStatus", from, "CHECKED_OUT");
        java.time.format.DateTimeFormatter shown = java.time.format.DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
        String note = "Hoàn thành đơn bằng biểu mẫu: check-in " + checkedInAt.atZoneSameInstant(zone).format(shown)
                + ", check-out " + checkedOutAt.atZoneSameInstant(zone).format(shown) + ".";
        for (String[] step : new String[][]{{from, "CHECKED_IN"}, {"CHECKED_IN", "CHECKED_OUT"}}) {
            jdbc.sql("""
                            INSERT INTO reservation_status_history
                                (reservation_id, field, from_status, to_status, actor_id, actor_type,
                                 reason, note, created_at)
                            VALUES (?, 'STAY', ?, ?, ?, 'ADMIN', 'STAY_COMPLETED_BY_FORM', ?, clock_timestamp())
                            """)
                    .params(rows.id(), step[0], step[1], actor.userId(), note).update();
        }
        audit.record(new AuditEvent(actor.userId(), highestRole(actor), "stay.completed_by_form",
                "reservation", rows.id(), Map.of("stayStatus", from),
                Map.of("stayStatus", "CHECKED_OUT", "checkedInAt", checkedInAt.toString(),
                        "checkedOutAt", checkedOutAt.toString()),
                "STAY_COMPLETED_BY_FORM", null, null, CorrelationId.current(), scope.toString()));
        tiers.recordCheckout(rows.id(), actor.userId());
        loyaltyPoints.earnForCheckout(rows.id());
        return new StayTransitionView(reference, from, "CHECKED_OUT");
    }

    private LocalTime cutoff() {
        String configured = settings.requireString(SettingKey.NO_SHOW_CUTOFF).trim();
        try {
            return LocalTime.parse(configured);
        } catch (DateTimeParseException ex) {
            throw new com.kas.platform.shared.MissingConfigurationException(
                    SettingKey.NO_SHOW_CUTOFF.name(), "must be a valid local time");
        }
    }

    private static boolean allowed(String from, Action action) {
        return switch (action) {
            case CHECK_IN -> "CONFIRMED".equals(from) || "CHECK_IN_READY".equals(from);
            case CHECK_OUT -> "CHECKED_IN".equals(from);
            // A check-out confirmed by mistake is put back to CHECKED_IN (V59 reverses its count).
            case UNDO_CHECK_OUT -> "CHECKED_OUT".equals(from);
            // Doc 54 T2 (CONFIRMED → CHECK_IN_READY) has no trigger yet, so a confirmed
            // stay is still CONFIRMED at the cutoff. noShowWindowOpen guards the timing.
            case NO_SHOW -> "CONFIRMED".equals(from) || "CHECK_IN_READY".equals(from);
        };
    }

    static boolean noShowWindowOpen(LocalDate checkIn, LocalDate today,
                                    LocalTime localTime, LocalTime cutoff) {
        return !today.isBefore(checkIn)
                && (today.isAfter(checkIn) || !localTime.isBefore(cutoff));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) return "SUPER_ADMIN";
        if (actor.roles().contains(UserRole.ADMIN)) return "ADMIN";
        return "CUSTOMER";
    }

    private static Object[] join(Object first, java.util.List<Object> rest) {
        Object[] result = new Object[rest.size() + 1];
        result[0] = first;
        for (int i = 0; i < rest.size(); i++) result[i + 1] = rest.get(i);
        return result;
    }

    private static Object[] join(Object first, Object second, Object third,
                                 java.util.List<Object> rest) {
        Object[] result = new Object[rest.size() + 3];
        result[0] = first; result[1] = second; result[2] = third;
        for (int i = 0; i < rest.size(); i++) result[i + 3] = rest.get(i);
        return result;
    }

    private record StayRow(UUID id, String stayStatus, LocalDate checkIn, LocalDate checkOut) { }

    public enum Action {
        CHECK_IN("CHECKED_IN", "stay.checked_in"),
        CHECK_OUT("CHECKED_OUT", "stay.checked_out"),
        NO_SHOW("NO_SHOW", "stay.no_show"),
        UNDO_CHECK_OUT("CHECKED_IN", "stay.check_out_undone");

        private final String toStatus;
        private final String auditAction;
        Action(String toStatus, String auditAction) {
            this.toStatus = toStatus;
            this.auditAction = auditAction;
        }
    }
}
