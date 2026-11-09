package com.kas.platform.voucher.api;

import com.kas.platform.identity.Permissions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
import java.util.List;
import java.util.UUID;

/** Voucher management for SUPER_ADMIN; redemption remains reservation-owned. */
@RestController
@RequestMapping("/api/v1/admin/vouchers")
@PreAuthorize("hasAuthority('" + Permissions.VOUCHER_MANAGE + "')")
public class AdminVoucherController {
    private final JdbcClient jdbc;

    public AdminVoucherController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<VoucherRow> list(@RequestParam(required = false) String q,
                                 @RequestParam(required = false) String status) {
        String search = q == null ? "" : q.trim();
        String state = status == null || status.isBlank() ? null : status.trim().toUpperCase();
        return jdbc.sql("""
                SELECT id, code::text AS code, name, description, voucher_type::text AS voucher_type,
                       value_percent, value_minor, value_add_description, currency,
                       valid_from, valid_to, stay_from, stay_to, min_nights, min_total_minor,
                       usage_limit_total, usage_limit_per_customer, used_count, stackable, status::text AS status,
                       COALESCE((SELECT json_agg(json_build_object('slug', p.slug, 'name', COALESCE(t.name, p.slug)) ORDER BY p.slug)::text
                                   FROM property p LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
                                  WHERE p.id = ANY (voucher.applicable_property_ids)), '[]') AS properties
                  FROM voucher
                 WHERE (:q = '' OR code::text ILIKE '%' || :q || '%' OR name ILIKE '%' || :q || '%')
                   AND (CAST(:status AS text) IS NULL OR status::text = :status)
                 ORDER BY created_at DESC, id
                 LIMIT 200
                """)
                .param("q", search).param("status", state)
                .query((rs, row) -> new VoucherRow(rs.getObject("id", UUID.class), rs.getString("code"),
                        rs.getString("name"), rs.getString("description"), rs.getString("voucher_type"),
                        rs.getBigDecimal("value_percent"), rs.getObject("value_minor", Long.class),
                        rs.getString("value_add_description"), rs.getString("currency"),
                        rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                        rs.getObject("stay_from", LocalDate.class), rs.getObject("stay_to", LocalDate.class),
                        (Integer) rs.getObject("min_nights"), rs.getObject("min_total_minor", Long.class),
                        (Integer) rs.getObject("usage_limit_total"), (Integer) rs.getObject("usage_limit_per_customer"),
                        rs.getInt("used_count"), rs.getBoolean("stackable"), rs.getString("status"),
                        hotels(rs.getString("properties"))))
                .list();
    }

    /**
     * Creates a voucher with a code the server generates.
     *
     * <p>The code is never typed by staff: it is {@code KAS-} plus eight characters
     * from an alphabet without look-alikes (no 0/O, 1/I/L), drawn from a
     * {@link java.security.SecureRandom}. {@code voucher_code_key} (citext UNIQUE)
     * decides uniqueness; a collision is skipped with {@code ON CONFLICT DO NOTHING}
     * and a fresh code is drawn, so the transaction is never aborted by it.
     */
    @PostMapping
    @Transactional
    public VoucherRow create(@Valid @RequestBody CreateVoucher request) {
        UUID[] propertyIds = propertyIds(request.propertySlugs());
        try {
            for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
                java.util.Optional<UUID> id = jdbc.sql("""
                        INSERT INTO voucher (code, name, description, voucher_type, value_percent,
                            value_minor, value_add_description, currency, valid_from, valid_to,
                            stay_from, stay_to, min_nights, min_total_minor, usage_limit_total,
                            usage_limit_per_customer, stackable, status, created_by, applicable_property_ids)
                        VALUES (:code, :name, :description, CAST(:type AS voucher_type), :percent,
                            :amount, NULL, :currency, :validFrom, :validTo, :stayFrom, :stayTo,
                            :minNights, :minTotal, :totalLimit, :customerLimit, :stackable,
                            CAST(:status AS voucher_status), :actor, :properties)
                        ON CONFLICT (code) DO NOTHING
                        RETURNING id
                        """)
                        .param("code", generateCode()).param("name", request.name().trim())
                        .param("description", request.description()).param("type", request.type().toUpperCase())
                        .param("percent", request.valuePercent()).param("amount", request.valueMinor())
                        .param("currency", request.currency().toUpperCase())
                        .param("validFrom", request.validFrom()).param("validTo", request.validTo())
                        .param("stayFrom", request.stayFrom()).param("stayTo", request.stayTo())
                        .param("minNights", request.minNights()).param("minTotal", request.minTotalMinor())
                        .param("totalLimit", request.usageLimitTotal()).param("customerLimit", request.usageLimitPerCustomer())
                        .param("stackable", false).param("status", request.status().toUpperCase())
                        .param("actor", com.kas.platform.security.CurrentActor.require().userId())
                        .param("properties", propertyIds)
                        .query(UUID.class).optional();
                if (id.isPresent()) {
                    return find(id.get());
                }
            }
            throw new IllegalStateException("Could not generate a unique voucher code");
        } catch (org.springframework.dao.DataIntegrityViolationException invalid) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                    "Voucher type, value, dates, or limits are invalid");
        }
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

    private static List<VoucherHotel> hotels(String json) {
        try {
            return List.of(JSON.readValue(json, VoucherHotel[].class));
        } catch (com.fasterxml.jackson.core.JsonProcessingException malformed) {
            throw new IllegalStateException("Voucher hotel list could not be read", malformed);
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
        return listById(id).orElseThrow(() -> new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.NOT_FOUND, "Voucher not found"));
    }

    private java.util.Optional<VoucherRow> listById(UUID id) {
        return jdbc.sql("""
                SELECT id, code::text AS code, name, description, voucher_type::text AS voucher_type,
                       value_percent, value_minor, value_add_description, currency,
                       valid_from, valid_to, stay_from, stay_to, min_nights, min_total_minor,
                       usage_limit_total, usage_limit_per_customer, used_count, stackable, status::text AS status,
                       COALESCE((SELECT json_agg(json_build_object('slug', p.slug, 'name', COALESCE(t.name, p.slug)) ORDER BY p.slug)::text
                                   FROM property p LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
                                  WHERE p.id = ANY (voucher.applicable_property_ids)), '[]') AS properties
                  FROM voucher WHERE id = :id
                """).param("id", id).query((rs, row) -> new VoucherRow(rs.getObject("id", UUID.class),
                rs.getString("code"), rs.getString("name"), rs.getString("description"), rs.getString("voucher_type"),
                rs.getBigDecimal("value_percent"), rs.getObject("value_minor", Long.class), rs.getString("value_add_description"),
                rs.getString("currency"), rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                rs.getObject("stay_from", LocalDate.class), rs.getObject("stay_to", LocalDate.class),
                (Integer) rs.getObject("min_nights"), rs.getObject("min_total_minor", Long.class),
                (Integer) rs.getObject("usage_limit_total"), (Integer) rs.getObject("usage_limit_per_customer"),
                rs.getInt("used_count"), rs.getBoolean("stackable"), rs.getString("status"),
                hotels(rs.getString("properties")))).optional();
    }

    /** No code field: the server generates it (a {@code code} in the body is an unknown property, so 400). */
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
                                @Size(max = 100) List<@NotBlank @Size(max = 100) String> propertySlugs) {}

    public record StatusChange(@NotBlank String status) {}
    public record VoucherRow(UUID id, String code, String name, String description, String type,
                             BigDecimal valuePercent, Long valueMinor, String valueAddDescription,
                             String currency, LocalDate validFrom, LocalDate validTo,
                             LocalDate stayFrom, LocalDate stayTo, Integer minNights,
                             Long minTotalMinor, Integer usageLimitTotal, Integer usageLimitPerCustomer,
                             int usedCount, boolean stackable, String status,
                             /** Hotels the voucher applies to; empty means every hotel. */
                             List<VoucherHotel> properties) {}

    public record VoucherHotel(String slug, String name) {}
}
