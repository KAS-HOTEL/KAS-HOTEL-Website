package com.kas.platform.customer.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.CorrelationId;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import java.util.Map;

/** Read-only customer and membership management surface for SUPER_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/customers")
@PreAuthorize("hasAuthority('" + Permissions.CUSTOMER_VIEW + "')")
public class AdminCustomerController {
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public AdminCustomerController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * One page of customers, newest first. Filters combine: free text (name, email,
     * phone), membership tier, and registration date ({@code registeredFrom} /
     * {@code registeredTo}, inclusive calendar days in the business time zone
     * Asia/Ho_Chi_Minh; one day = the same date twice). The body is the page; the total
     * number of matches is in the {@code X-Total-Count} header (added 2026-11-07, so the
     * response shape older consoles read is unchanged).
     */
    @GetMapping
    public List<CustomerRow> list(@RequestParam(required = false) String q,
                                  @RequestParam(required = false) String tier,
                                  @RequestParam(required = false)
                                  @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                                  java.time.LocalDate registeredFrom,
                                  @RequestParam(required = false)
                                  @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                                  java.time.LocalDate registeredTo,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "50") int size,
                                  HttpServletRequest request,
                                  jakarta.servlet.http.HttpServletResponse response) {
        int safePage = Math.max(0, page);
        int safeSize = Math.clamp(size, 1, 100);
        String search = q == null ? "" : q.trim();
        String tierCode = tier == null || tier.isBlank() ? null : tier.trim().toUpperCase();
        if (registeredFrom != null && registeredTo != null && registeredFrom.isAfter(registeredTo)) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "registeredFrom must not be after registeredTo.", List.of(
                    new com.kas.platform.shared.KasException.ErrorDetail("registeredFrom", "DATE_RANGE_INVALID",
                            "The start date must not be after the end date.")));
        }
        java.time.ZoneId zone = com.kas.platform.shared.TimeConfiguration.PROPERTY_ZONE;
        java.time.OffsetDateTime from = registeredFrom == null ? null
                : registeredFrom.atStartOfDay(zone).toOffsetDateTime();
        java.time.OffsetDateTime toExclusive = registeredTo == null ? null
                : registeredTo.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        String where = """
                 WHERE c.merged_into_id IS NULL AND c.anonymised_at IS NULL
                   AND (:q = '' OR c.full_name ILIKE '%' || :q || '%'
                        OR c.email::text ILIKE '%' || :q || '%' OR c.phone ILIKE '%' || :q || '%')
                   AND (CAST(:tier AS text) IS NULL OR mt.code = :tier)
                   AND (CAST(:fromAt AS timestamptz) IS NULL OR c.created_at >= :fromAt)
                   AND (CAST(:toAt AS timestamptz) IS NULL OR c.created_at < :toAt)
                """;
        String joins = """
                  FROM customer c
                  LEFT JOIN app_user u ON u.id = c.user_id
                  LEFT JOIN customer_avatar av ON av.customer_id = c.id
                  LEFT JOIN customer_membership cm ON cm.customer_id = c.id AND cm.status = 'ACTIVE'
                  LEFT JOIN customer_membership_tier_history mth
                         ON mth.membership_id = cm.id AND mth.effective_to IS NULL
                  LEFT JOIN membership_tier mt ON mt.id = mth.tier_id
                  LEFT JOIN cashback_account ca ON ca.customer_id = c.id
                """;
        long total = jdbc.sql("SELECT count(*)" + joins + where)
                .param("q", search).param("tier", tierCode).param("fromAt", from).param("toAt", toExclusive)
                .query(Long.class).single();
        List<CustomerRow> rows = jdbc.sql("""
                SELECT c.id, c.full_name, c.email::text AS email, c.phone, c.country,
                       c.locale, c.created_at, mt.code AS tier,
                       COALESCE(ca.balance_points, 0) AS points,
                       COALESCE(ca.reserved_points, 0) AS reserved_points,
                       c.customer_code, av.version AS avatar_version,
                       CASE WHEN u.id IS NULL THEN 'NO_ACCOUNT'
                            WHEN u.status = 'ACTIVE' AND u.email_verified_at IS NULL THEN 'UNVERIFIED'
                            ELSE u.status::text END AS account_status
                """ + joins + where + """
                 ORDER BY c.created_at DESC, c.id
                 LIMIT :limit OFFSET :offset
                """)
                .param("q", search).param("tier", tierCode).param("fromAt", from).param("toAt", toExclusive)
                .param("limit", safeSize).param("offset", (long) safePage * safeSize)
                .query((rs, rowNum) -> new CustomerRow(rs.getObject("id", UUID.class),
                        rs.getString("full_name"), rs.getString("email"), rs.getString("phone"),
                        rs.getString("country"), rs.getString("locale"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("tier"),
                        rs.getLong("points"), rs.getLong("reserved_points"), rs.getString("customer_code"),
                        rs.getString("account_status"), avatarUrl(rs.getObject("id", UUID.class),
                                (Integer) rs.getObject("avatar_version"))))
                .list();
        response.setHeader("X-Total-Count", Long.toString(total));
        recordAccess("CUSTOMER_SEARCH_VIEWED", null, request, Map.of("resultCount", rows.size()));
        return rows;
    }

    @GetMapping("/{customerId}")
    public CustomerRow detail(@PathVariable UUID customerId, HttpServletRequest request) {
        CustomerRow row = jdbc.sql("""
                SELECT c.id, c.full_name, c.email::text AS email, c.phone, c.country,
                       c.locale, c.created_at, mt.code AS tier,
                       COALESCE(ca.balance_points, 0) AS points,
                       COALESCE(ca.reserved_points, 0) AS reserved_points,
                       c.customer_code, av.version AS avatar_version,
                       CASE WHEN u.id IS NULL THEN 'NO_ACCOUNT'
                            WHEN u.status = 'ACTIVE' AND u.email_verified_at IS NULL THEN 'UNVERIFIED'
                            ELSE u.status::text END AS account_status
                  FROM customer c
                  LEFT JOIN app_user u ON u.id = c.user_id
                  LEFT JOIN customer_avatar av ON av.customer_id = c.id
                  LEFT JOIN customer_membership cm ON cm.customer_id = c.id AND cm.status = 'ACTIVE'
                  LEFT JOIN customer_membership_tier_history mth
                         ON mth.membership_id = cm.id AND mth.effective_to IS NULL
                  LEFT JOIN membership_tier mt ON mt.id = mth.tier_id
                  LEFT JOIN cashback_account ca ON ca.customer_id = c.id
                 WHERE c.id = :id AND c.merged_into_id IS NULL AND c.anonymised_at IS NULL
                """)
                .param("id", customerId)
                .query((rs, rowNum) -> new CustomerRow(rs.getObject("id", UUID.class),
                        rs.getString("full_name"), rs.getString("email"), rs.getString("phone"),
                        rs.getString("country"), rs.getString("locale"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("tier"),
                        rs.getLong("points"), rs.getLong("reserved_points"), rs.getString("customer_code"),
                        rs.getString("account_status"), avatarUrl(rs.getObject("id", UUID.class),
                                (Integer) rs.getObject("avatar_version"))))
                .optional().orElseThrow(() -> new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Customer not found"));
        recordAccess("CUSTOMER_PROFILE_VIEWED", customerId, request, null);
        return row;
    }

    @PatchMapping("/{customerId}")
    @PreAuthorize("hasAuthority('" + Permissions.CUSTOMER_EDIT + "')")
    @Transactional
    public CustomerRow update(@PathVariable UUID customerId,
                              @Valid @RequestBody UpdateCustomer request,
                              HttpServletRequest httpRequest) {
        CustomerRow before = detail(customerId, httpRequest);
        jdbc.sql("""
                UPDATE customer
                   SET full_name = :name, phone = :phone, country = :country,
                       locale = :locale, updated_at = now()
                 WHERE id = :id AND merged_into_id IS NULL AND anonymised_at IS NULL
                """)
                .param("name", request.fullName().trim()).param("phone", request.phone())
                .param("country", request.country()).param("locale", request.locale())
                .param("id", customerId).update();
        audit.record(new AuditEvent(CurrentActor.require().userId(), "SUPER_ADMIN", "CUSTOMER_PROFILE_UPDATED",
                "customer", customerId,
                Map.of("fullName", before.fullName() == null ? "" : before.fullName(), "phone", before.phone() == null ? "" : before.phone(),
                        "country", before.country() == null ? "" : before.country(), "locale", before.locale()),
                Map.of("fullName", request.fullName().trim(), "phone", request.phone() == null ? "" : request.phone(),
                        "country", request.country() == null ? "" : request.country(), "locale", request.locale()),
                null, httpRequest.getRemoteAddr(), httpRequest.getHeader("User-Agent"),
                CorrelationId.current(), CurrentActor.requireScope().kind().name()));
        return detail(customerId, httpRequest);
    }

    private void recordAccess(String action, UUID customerId, HttpServletRequest request,
                              Map<String, Object> after) {
        var actor = CurrentActor.require();
        audit.record(new AuditEvent(actor.userId(), "SUPER_ADMIN", action, "customer",
                customerId, null, after, null, request.getRemoteAddr(),
                request.getHeader("User-Agent"), CorrelationId.current(), actor.scope().kind().name()));
    }

    /** The customer's photo for staff; the version in the URL makes it cacheable. */
    @GetMapping("/{customerId}/avatar")
    public org.springframework.http.ResponseEntity<byte[]> avatar(@PathVariable UUID customerId) {
        return jdbc.sql("SELECT content_type, image FROM customer_avatar WHERE customer_id = :id")
                .param("id", customerId)
                .query((rs, n) -> MeCustomerController.imageResponse(rs.getString("content_type"), rs.getBytes("image")))
                .optional()
                .orElseGet(() -> org.springframework.http.ResponseEntity.notFound().build());
    }

    private static String avatarUrl(UUID customerId, Integer version) {
        return version == null ? null : "/api/v1/admin/customers/" + customerId + "/avatar?v=" + version;
    }

    /**
     * {@code accountStatus}: {@code NO_ACCOUNT} for a guest record without a login,
     * {@code UNVERIFIED} for an account whose email is not verified yet, otherwise the
     * account's own status ({@code ACTIVE}, {@code SUSPENDED}, {@code DISABLED}).
     */
    public record CustomerRow(UUID id, String fullName, String email, String phone,
                              String country, String locale, java.time.Instant createdAt,
                              String tier, long points, long reservedPoints, String customerCode,
                              String accountStatus, String avatarUrl) {}
    public record UpdateCustomer(@NotBlank @Size(max = 200) String fullName,
                                 @Size(max = 32) String phone,
                                 @Pattern(regexp = "[A-Z]{2}") String country,
                                 @NotBlank @Pattern(regexp = "vi|en") String locale) {}
}
