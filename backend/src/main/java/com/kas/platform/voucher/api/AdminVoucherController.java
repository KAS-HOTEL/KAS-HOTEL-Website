package com.kas.platform.voucher.api;

import com.kas.platform.identity.Permissions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Voucher management for SUPER_ADMIN; redemption remains reservation-owned. */
@RestController
@RequestMapping("/api/v1/admin/vouchers")
@PreAuthorize("hasAuthority('" + Permissions.VOUCHER_MANAGE + "')")
public class AdminVoucherController {
    private final JdbcClient jdbc;
    private final java.time.Clock clock;

    public AdminVoucherController(JdbcClient jdbc, java.time.Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * The status staff see. A voucher past its last valid day (business date,
     * Asia/Ho_Chi_Minh) or past its end time (V72) shows as EXPIRED and one whose total uses
     * are spent shows as USED_UP, whatever status is stored — the guest side already refuses
     * both (StayAdjustmentService). The stored status is left as it is.
     */
    private static final String DISPLAY_STATUS = """
            CASE WHEN status = 'EXPIRED' OR (valid_to IS NOT NULL AND valid_to < :today)
                      OR (valid_to_at IS NOT NULL AND valid_to_at <= now()) THEN 'EXPIRED'
                 WHEN usage_limit_total IS NOT NULL AND used_count >= usage_limit_total THEN 'USED_UP'
                 ELSE status::text END""";

    /** One row of the list, with its hotels, tiers and customers (V72). */
    private static final String SELECT_ROW = """
            SELECT id, code::text AS code, name, description, voucher_type::text AS voucher_type,
                   value_percent, value_minor, value_add_description, currency,
                   valid_from, valid_to, valid_from_at, valid_to_at, created_at,
                   stay_from, stay_to, min_nights, min_total_minor,
                   usage_limit_total, usage_limit_per_customer, used_count, stackable, status::text AS status,
                   __DISPLAY_STATUS__ AS display_status, audience,
                   COALESCE((SELECT json_agg(json_build_object('slug', p.slug, 'name', COALESCE(t.name, p.slug)) ORDER BY p.slug)::text
                               FROM property p LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
                              WHERE p.id = ANY (voucher.applicable_property_ids)), '[]') AS properties,
                   COALESCE((SELECT json_agg(json_build_object('id', mt.id, 'code', mt.code,
                                                               'name', COALESCE(tt.display_name, mt.code)) ORDER BY mt.sort_order)::text
                               FROM membership_tier mt
                               LEFT JOIN membership_tier_translation tt ON tt.tier_id = mt.id AND tt.locale = 'vi'
                              WHERE mt.id = ANY (voucher.audience_tier_ids)), '[]') AS tiers,
                   COALESCE((SELECT json_agg(json_build_object('id', c.id, 'customerCode', c.customer_code,
                                                               'fullName', c.full_name, 'email', c.email::text) ORDER BY c.full_name)::text
                               FROM voucher_customer vc JOIN customer c ON c.id = vc.customer_id
                              WHERE vc.voucher_id = voucher.id), '[]') AS customers
              FROM voucher
            """.replace("__DISPLAY_STATUS__", DISPLAY_STATUS);

    private java.time.LocalDate today() {
        return java.time.LocalDate.now(clock.withZone(com.kas.platform.shared.TimeConfiguration.PROPERTY_ZONE));
    }

    @GetMapping
    public List<VoucherRow> list(@RequestParam(required = false) String q,
                                 @RequestParam(required = false) String status) {
        String search = q == null ? "" : q.trim();
        String state = status == null || status.isBlank() ? null : status.trim().toUpperCase();
        return jdbc.sql(SELECT_ROW + """
                 WHERE (:q = '' OR code::text ILIKE '%' || :q || '%' OR name ILIKE '%' || :q || '%')
                   AND (CAST(:status AS text) IS NULL OR (__DISPLAY_STATUS__) = :status)
                 ORDER BY created_at DESC, id
                 LIMIT 200
                """.replace("__DISPLAY_STATUS__", DISPLAY_STATUS))
                .param("q", search).param("status", state).param("today", today())
                .query((rs, row) -> row(rs))
                .list();
    }

    /** Active member tiers, for a voucher meant for some tiers (2026-11-14). */
    @GetMapping("/tiers")
    public List<VoucherTier> tiers() {
        return jdbc.sql("""
                SELECT mt.id, mt.code, COALESCE(tt.display_name, mt.code) AS name
                  FROM membership_tier mt
                  LEFT JOIN membership_tier_translation tt ON tt.tier_id = mt.id AND tt.locale = 'vi'
                 WHERE mt.status = 'ACTIVE'
                 ORDER BY mt.sort_order, mt.code
                """).query((rs, n) -> new VoucherTier(rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getString("name"))).list();
    }

    /**
     * Customer accounts by customer code, email or name, for a voucher meant for chosen
     * customers (2026-11-14). At most 10; merged and anonymised accounts are left out.
     */
    @GetMapping("/customers")
    public List<VoucherCustomer> customers(@RequestParam String q) {
        String search = q == null ? "" : q.trim();
        if (search.length() < 2) return List.of();
        return jdbc.sql("""
                SELECT id, customer_code, full_name, email::text AS email
                  FROM customer
                 WHERE merged_into_id IS NULL AND anonymised_at IS NULL
                   AND (customer_code ILIKE '%' || :q || '%' OR email::text ILIKE '%' || :q || '%'
                        OR full_name ILIKE '%' || :q || '%')
                 ORDER BY (customer_code ILIKE :q OR email::text ILIKE :q) DESC, full_name
                 LIMIT 10
                """).param("q", search)
                .query((rs, n) -> new VoucherCustomer(rs.getObject("id", UUID.class), rs.getString("customer_code"),
                        rs.getString("full_name"), rs.getString("email"))).list();
    }

    /**
     * Creates a voucher with a code the server generates.
     *
     * <p>The code is never typed by staff: it is {@code KAS-} plus eight characters
     * from an alphabet without look-alikes (no 0/O, 1/I/L), drawn from a
     * {@link java.security.SecureRandom}. {@code voucher_code_key} (citext UNIQUE)
     * decides uniqueness; a collision is skipped with {@code ON CONFLICT DO NOTHING}
     * and a fresh code is drawn, so the transaction is never aborted by it.
     *
     * <p>Owner 2026-11-14: the voucher starts the moment it is created ({@code valid_from_at =
     * now()}) and ends at {@code validToAt}; it is for everyone, some member tiers or chosen
     * customers ({@code audience}).
     */
    @PostMapping
    @Transactional
    public VoucherRow create(@Valid @RequestBody CreateVoucher request) {
        UUID[] propertyIds = propertyIds(request.propertySlugs());
        String audience = request.audience() == null || request.audience().isBlank() ? "ALL" : request.audience().trim().toUpperCase();
        UUID[] tierIds = "TIERS".equals(audience) ? tierIds(request.tierIds()) : null;
        List<UUID> customerIds = "CUSTOMERS".equals(audience) ? customerIds(request.customerIds()) : List.of();
        OffsetDateTime now = OffsetDateTime.now(clock);
        LocalDate validTo = request.validTo();
        if (request.validToAt() != null) {
            if (!request.validToAt().isAfter(now)) {
                throw invalid("validToAt", "IN_THE_PAST", "Thời gian kết thúc phải sau thời điểm tạo voucher.");
            }
            validTo = request.validToAt().atZoneSameInstant(com.kas.platform.shared.TimeConfiguration.PROPERTY_ZONE).toLocalDate();
        }
        if (validTo != null && validTo.isBefore(today())) {
            throw invalid("validTo", "IN_THE_PAST", "Ngày kết thúc phải từ hôm nay trở đi.");
        }
        try {
            for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
                java.util.Optional<UUID> id = jdbc.sql("""
                        INSERT INTO voucher (code, name, description, voucher_type, value_percent,
                            value_minor, value_add_description, currency, valid_from, valid_to,
                            valid_from_at, valid_to_at, audience, audience_tier_ids,
                            stay_from, stay_to, min_nights, min_total_minor, usage_limit_total,
                            usage_limit_per_customer, stackable, status, created_by, applicable_property_ids)
                        VALUES (:code, :name, :description, CAST(:type AS voucher_type), :percent,
                            :amount, NULL, :currency, :validFrom, :validTo,
                            :validFromAt, :validToAt, :audience, :tierIds,
                            :stayFrom, :stayTo, :minNights, :minTotal, :totalLimit, :customerLimit, :stackable,
                            CAST(:status AS voucher_status), :actor, :properties)
                        ON CONFLICT (code) DO NOTHING
                        RETURNING id
                        """)
                        .param("code", generateCode()).param("name", request.name().trim())
                        .param("description", request.description()).param("type", request.type().toUpperCase())
                        .param("percent", request.valuePercent()).param("amount", request.valueMinor())
                        .param("currency", request.currency().toUpperCase())
                        .param("validFrom", today()).param("validTo", validTo)
                        .param("validFromAt", now).param("validToAt", request.validToAt())
                        .param("audience", audience).param("tierIds", tierIds)
                        .param("stayFrom", request.stayFrom()).param("stayTo", request.stayTo())
                        .param("minNights", request.minNights()).param("minTotal", request.minTotalMinor())
                        .param("totalLimit", request.usageLimitTotal()).param("customerLimit", request.usageLimitPerCustomer())
                        .param("stackable", false).param("status", request.status().toUpperCase())
                        .param("actor", com.kas.platform.security.CurrentActor.require().userId())
                        .param("properties", propertyIds)
                        .query(UUID.class).optional();
                if (id.isPresent()) {
                    for (UUID customerId : customerIds) {
                        jdbc.sql("INSERT INTO voucher_customer (voucher_id, customer_id) VALUES (:v, :c)")
                                .param("v", id.get()).param("c", customerId).update();
                    }
                    return find(id.get());
                }
            }
            throw new IllegalStateException("Could not generate a unique voucher code");
        } catch (org.springframework.dao.DataIntegrityViolationException invalid) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "Voucher type, value, dates, or limits are invalid");
        }
    }

    private static com.kas.platform.shared.KasException invalid(String field, String code, String message) {
        return new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, message,
                List.of(new com.kas.platform.shared.KasException.ErrorDetail(field, code, message)));
    }

    /** The chosen tiers: at least one, each an ACTIVE tier. */
    private UUID[] tierIds(List<UUID> ids) {
        List<UUID> wanted = ids == null ? List.of() : ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (wanted.isEmpty()) throw invalid("tierIds", "REQUIRED", "Chọn ít nhất một hạng thành viên.");
        long found = jdbc.sql("SELECT count(*) FROM membership_tier WHERE id = ANY (:ids) AND status = 'ACTIVE'")
                .param("ids", wanted.toArray(UUID[]::new)).query(Long.class).single();
        if (found != wanted.size()) throw invalid("tierIds", "UNKNOWN", "Một hoặc nhiều hạng thành viên không tồn tại.");
        return wanted.toArray(UUID[]::new);
    }

    /** The chosen customers: at least one, each an existing, unmerged account. */
    private List<UUID> customerIds(List<UUID> ids) {
        List<UUID> wanted = ids == null ? List.of() : ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (wanted.isEmpty()) throw invalid("customerIds", "REQUIRED", "Chọn ít nhất một khách hàng.");
        long found = jdbc.sql("SELECT count(*) FROM customer WHERE id = ANY (:ids) AND merged_into_id IS NULL AND anonymised_at IS NULL")
                .param("ids", wanted.toArray(UUID[]::new)).query(Long.class).single();
        if (found != wanted.size()) throw invalid("customerIds", "UNKNOWN", "Một hoặc nhiều khách hàng không tồn tại.");
        return wanted;
    }

    /**
     * The hotels a voucher applies to, from their slugs. No slugs means every hotel
     * (stored as NULL, the column's existing meaning). An unknown slug is refused
     * rather than silently dropped, so a voucher never applies to fewer hotels than
     * staff chose.
     */
    private UUID[] propertyIds(List<String> slugs) {
        if (slugs == null || slugs.isEmpty()) {
            return null;
        }
        List<String> wanted = slugs.stream().map(String::trim).filter(slug -> !slug.isEmpty()).distinct().toList();
        if (wanted.isEmpty()) {
            return null;
        }
        List<UUID> ids = jdbc.sql("SELECT id FROM property WHERE slug = ANY (:slugs) ORDER BY slug")
                .param("slugs", wanted.toArray(String[]::new)).query(UUID.class).list();
        if (ids.size() != wanted.size()) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "One or more selected hotels do not exist");
        }
        return ids.toArray(UUID[]::new);
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    private static <T> List<T> jsonList(String json, Class<T[]> type) {
        try {
            return List.of(JSON.readValue(json, type));
        } catch (com.fasterxml.jackson.core.JsonProcessingException malformed) {
            throw new IllegalStateException("Voucher list column could not be read", malformed);
        }
    }

    private static final int CODE_ATTEMPTS = 8;
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();

    static String generateCode() {
        StringBuilder code = new StringBuilder("KAS-");
        for (int i = 0; i < 8; i++) {
            code.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    @PatchMapping("/{id}/status")
    @Transactional
    public VoucherRow setStatus(@PathVariable UUID id, @Valid @RequestBody StatusChange request) {
        String status = request.status().trim().toUpperCase();
        if (!List.of("DRAFT", "ACTIVE", "PAUSED", "EXPIRED").contains(status)) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED, "Invalid voucher status");
        }
        int changed = jdbc.sql("UPDATE voucher SET status = CAST(:status AS voucher_status), updated_at = now() WHERE id = :id")
                .param("status", status).param("id", id).update();
        if (changed == 0) throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Voucher not found");
        return find(id);
    }

    private VoucherRow find(UUID id) {
        return jdbc.sql(SELECT_ROW + " WHERE id = :id").param("id", id).param("today", today())
                .query((rs, row) -> row(rs)).optional()
                .orElseThrow(() -> new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Voucher not found"));
    }

    private static VoucherRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new VoucherRow(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("name"), rs.getString("description"), rs.getString("voucher_type"),
                rs.getBigDecimal("value_percent"), rs.getObject("value_minor", Long.class),
                rs.getString("value_add_description"), rs.getString("currency"),
                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                rs.getObject("stay_from", LocalDate.class), rs.getObject("stay_to", LocalDate.class),
                (Integer) rs.getObject("min_nights"), rs.getObject("min_total_minor", Long.class),
                (Integer) rs.getObject("usage_limit_total"), (Integer) rs.getObject("usage_limit_per_customer"),
                rs.getInt("used_count"), rs.getBoolean("stackable"), rs.getString("status"), rs.getString("display_status"),
                jsonList(rs.getString("properties"), VoucherHotel[].class),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("valid_from_at", OffsetDateTime.class), rs.getObject("valid_to_at", OffsetDateTime.class),
                rs.getString("audience"),
                jsonList(rs.getString("tiers"), VoucherTier[].class),
                jsonList(rs.getString("customers"), VoucherCustomer[].class));
    }

    /**
     * No code field: the server generates it (a {@code code} in the body is an unknown property, so 400).
     * No start: the voucher starts when it is created (2026-11-14); {@code validFrom} is accepted
     * from older clients and ignored. {@code validToAt} (date and time) wins over {@code validTo}.
     */
    public record CreateVoucher(@NotBlank @Size(max = 200) String name,
                                @Size(max = 2000) String description,
                                @NotBlank @Pattern(regexp = "PERCENTAGE|FIXED_AMOUNT") String type,
                                @DecimalMin("0.001") @DecimalMax("100") BigDecimal valuePercent,
                                @jakarta.validation.constraints.PositiveOrZero Long valueMinor,
                                @NotBlank @Pattern(regexp = "VND|USD") String currency,
                                LocalDate validFrom, LocalDate validTo, LocalDate stayFrom, LocalDate stayTo,
                                @jakarta.validation.constraints.Positive Integer minNights,
                                @jakarta.validation.constraints.PositiveOrZero Long minTotalMinor,
                                @jakarta.validation.constraints.Positive Integer usageLimitTotal,
                                @jakarta.validation.constraints.Positive Integer usageLimitPerCustomer,
                                @NotBlank @Pattern(regexp = "DRAFT|ACTIVE|PAUSED|EXPIRED") String status,
                                @Size(max = 100) List<@NotBlank @Size(max = 100) String> propertySlugs,
                                OffsetDateTime validToAt,
                                @Pattern(regexp = "(?i)ALL|TIERS|CUSTOMERS") String audience,
                                @Size(max = 20) List<UUID> tierIds,
                                @Size(max = 500) List<UUID> customerIds) {}

    public record StatusChange(@NotBlank String status) {}
    public record VoucherRow(UUID id, String code, String name, String description, String type,
                             BigDecimal valuePercent, Long valueMinor, String valueAddDescription,
                             String currency, LocalDate validFrom, LocalDate validTo,
                             LocalDate stayFrom, LocalDate stayTo, Integer minNights,
                             Long minTotalMinor, Integer usageLimitTotal, Integer usageLimitPerCustomer,
                             int usedCount, boolean stackable, String status,
                             /** What staff see: {@code status}, or EXPIRED / USED_UP when the dates or uses say so. */
                             String displayStatus,
                             /** Hotels the voucher applies to; empty means every hotel. */
                             List<VoucherHotel> properties,
                             /** When it was created (the real time, 2026-11-14). */
                             OffsetDateTime createdAt,
                             /** Real start / end (V72); null for older, date-only vouchers. */
                             OffsetDateTime validFromAt, OffsetDateTime validToAt,
                             /** ALL, TIERS or CUSTOMERS. */
                             String audience,
                             List<VoucherTier> tiers,
                             List<VoucherCustomer> customers) {}

    public record VoucherHotel(String slug, String name) {}
    public record VoucherTier(UUID id, String code, String name) {}
    public record VoucherCustomer(UUID id, String customerCode, String fullName, String email) {}
}
