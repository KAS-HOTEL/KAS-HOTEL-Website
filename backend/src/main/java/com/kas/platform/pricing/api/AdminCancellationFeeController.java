package com.kas.platform.pricing.api;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Late-cancellation fees for SUPER_ADMIN (Console → Giá phòng → Phí huỷ phòng).
 *
 * <p>One rule for every hotel (no hotel) and/or one per hotel; a hotel's rule replaces the
 * all-hotels rule for that hotel. A fixed amount or a percent of the booking total. With no
 * active rule a late cancellation is reviewed by SUPER_ADMIN by hand; nothing is seeded.
 */
@RestController
@RequestMapping("/api/v1/admin/cancellation-fees")
@PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
public class AdminCancellationFeeController {

    private static final String ENTITY = "cancellation_fee_rule";
    private static final String SELECT = """
            SELECT f.id, f.property_id, p.slug AS property_slug, COALESCE(t.name, p.slug) AS property_name,
                   f.fee_type, f.amount_minor, f.percent, f.currency, f.note, f.status, f.version, f.updated_at
              FROM cancellation_fee_rule f
              LEFT JOIN property p ON p.id = f.property_id
              LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
            """;

    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public AdminCancellationFeeController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping
    public List<FeeRuleView> list() {
        return jdbc.sql(SELECT + " ORDER BY (f.property_id IS NOT NULL), property_name, f.status, f.updated_at DESC")
                .query((rs, n) -> view(rs)).list();
    }

    @PostMapping
    public FeeRuleView create(@Valid @RequestBody FeeRuleRequest request) {
        validate(request);
        UUID id = UUID.randomUUID();
        UUID actor = CurrentActor.require().actor().userId();
        try {
            jdbc.sql("""
                    INSERT INTO cancellation_fee_rule (id, property_id, fee_type, amount_minor, percent, note,
                                                       status, created_by, updated_by)
                    VALUES (:id, :propertyId, :feeType, :amount, :percent, :note, :status, :actor, :actor)
                    """).param("id", id).param("propertyId", request.propertyId())
                    .param("feeType", request.feeType()).param("amount", amountOf(request))
                    .param("percent", percentOf(request)).param("note", blankToNull(request.note()))
                    .param("status", request.statusOrActive()).param("actor", actor).update();
        } catch (DuplicateKeyException duplicate) {
            throw oneActive();
        }
        FeeRuleView created = get(id);
        record("cancellation_fee.created", id, null, snapshot(created));
        return created;
    }

    @PutMapping("/{id}")
    public FeeRuleView update(@PathVariable UUID id, @Valid @RequestBody FeeRuleRequest request) {
        validate(request);
        if (request.version() == null) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "version is required");
        }
        FeeRuleView before = get(id);
        int changed;
        try {
            changed = jdbc.sql("""
                    UPDATE cancellation_fee_rule
                       SET property_id = :propertyId, fee_type = :feeType, amount_minor = :amount,
                           percent = :percent, note = :note, status = :status,
                           version = version + 1, updated_at = now(), updated_by = :actor
                     WHERE id = :id AND version = :version
                    """).param("id", id).param("version", request.version())
                    .param("propertyId", request.propertyId()).param("feeType", request.feeType())
                    .param("amount", amountOf(request)).param("percent", percentOf(request))
                    .param("note", blankToNull(request.note())).param("status", request.statusOrActive())
                    .param("actor", CurrentActor.require().actor().userId()).update();
        } catch (DuplicateKeyException duplicate) {
            throw oneActive();
        }
        if (changed == 0) {
            throw new KasException(ApiErrorCode.VERSION_CONFLICT,
                    "Phí huỷ này vừa được người khác sửa. Vui lòng tải lại.");
        }
        FeeRuleView after = get(id);
        record("cancellation_fee.updated", id, snapshot(before), snapshot(after));
        return after;
    }

    /** A rule already used by a cancellation request stays (it is referenced); turn it off instead. */
    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        FeeRuleView before = get(id);
        long used = jdbc.sql("SELECT count(*) FROM reservation_cancellation_request WHERE fee_rule_id = :id")
                .param("id", id).query(Long.class).single();
        if (used > 0) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Phí huỷ này đã được dùng cho yêu cầu huỷ; hãy tắt thay vì xoá.");
        }
        jdbc.sql("DELETE FROM cancellation_fee_rule WHERE id = :id").param("id", id).update();
        record("cancellation_fee.deleted", id, snapshot(before), null);
    }

    private FeeRuleView get(UUID id) {
        return jdbc.sql(SELECT + " WHERE f.id = :id").param("id", id).query((rs, n) -> view(rs)).optional()
                .orElseThrow(() -> new KasException(ApiErrorCode.NOT_FOUND, "Không tìm thấy phí huỷ."));
    }

    private void validate(FeeRuleRequest request) {
        boolean fixed = "FIXED_AMOUNT".equals(request.feeType());
        if (fixed && (request.amountMinor() == null || request.percent() != null)) {
            throw invalid("amountMinor", "Phí cố định cần số tiền (và không có phần trăm).");
        }
        if (!fixed && (request.percent() == null || request.amountMinor() != null)) {
            throw invalid("percent", "Phí theo phần trăm cần tỷ lệ (và không có số tiền).");
        }
        if (request.propertyId() != null && jdbc.sql("SELECT count(*) FROM property WHERE id = :id")
                .param("id", request.propertyId()).query(Long.class).single() == 0) {
            throw invalid("propertyId", "Khách sạn đã chọn không tồn tại.");
        }
    }

    private static Long amountOf(FeeRuleRequest r) {
        return "FIXED_AMOUNT".equals(r.feeType()) ? r.amountMinor().longValueExact() : null;
    }

    private static BigDecimal percentOf(FeeRuleRequest r) {
        return "PERCENT_OF_TOTAL".equals(r.feeType()) ? r.percent() : null;
    }

    private static KasException oneActive() {
        return new KasException(ApiErrorCode.VALIDATION_FAILED,
                "Phạm vi này đã có một phí huỷ đang bật. Hãy sửa hoặc tắt phí đó trước.",
                List.of(new KasException.ErrorDetail("propertyId", "ONE_ACTIVE_RULE",
                        "One active rule per hotel and one for every hotel.")));
    }

    private static KasException invalid(String field, String message) {
        return new KasException(ApiErrorCode.VALIDATION_FAILED, message,
                List.of(new KasException.ErrorDetail(field, "INVALID", message)));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static FeeRuleView view(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new FeeRuleView(rs.getObject("id", UUID.class), rs.getObject("property_id", UUID.class),
                rs.getString("property_slug"), rs.getString("property_name"), rs.getString("fee_type"),
                rs.getObject("amount_minor", Long.class), rs.getBigDecimal("percent"), rs.getString("currency"),
                rs.getString("note"), rs.getString("status"), rs.getInt("version"),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private static Map<String, Object> snapshot(FeeRuleView v) {
        Map<String, Object> m = new HashMap<>();
        m.put("propertyId", v.propertyId());
        m.put("feeType", v.feeType());
        m.put("amountMinor", v.amountMinor());
        m.put("percent", v.percent());
        m.put("status", v.status());
        return m;
    }

    private void record(String action, UUID id, Map<String, Object> before, Map<String, Object> after) {
        var principal = CurrentActor.require().actor();
        audit.record(new AuditEvent(principal.userId(), "SUPER_ADMIN", action, ENTITY, id,
                before, after, null, null, null, CorrelationId.current(), principal.scope().toString()));
    }

    public record FeeRuleRequest(
            UUID propertyId,
            @NotBlank @Pattern(regexp = "FIXED_AMOUNT|PERCENT_OF_TOTAL") String feeType,
            @PositiveOrZero @Digits(integer = 15, fraction = 0) BigDecimal amountMinor,
            @DecimalMin(value = "0.01") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal percent,
            @Size(max = 1000) String note,
            @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            Integer version) {
        String statusOrActive() { return status == null ? "ACTIVE" : status; }
    }

    public record FeeRuleView(UUID id, UUID propertyId, String propertySlug, String propertyName, String feeType,
                              Long amountMinor, BigDecimal percent, String currency, String note, String status,
                              int version, OffsetDateTime updatedAt) {
    }
}
