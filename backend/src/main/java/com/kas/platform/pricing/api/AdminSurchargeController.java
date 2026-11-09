package com.kas.platform.pricing.api;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.UserRole;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.security.KasPrincipal;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Surcharges (phụ thu) for SUPER_ADMIN: early check-in, late check-out, extra guests,
 * extra bed, holidays and any surcharge staff define, each with its conditions.
 *
 * <p>A surcharge with no hotel applies to every hotel. A hotel-specific surcharge with
 * the same code as an all-hotels one replaces it for that hotel (see
 * {@link PublicSurchargeController}).
 *
 * <p>Presets seeded by V53 can be edited and turned off, but not deleted, so the
 * common surcharges always remain available to switch back on.
 *
 * <p>This records the surcharges and their conditions. It does not change how a quote or
 * a reservation total is calculated.
 */
@RestController
@RequestMapping("/api/v1/admin/surcharges")
@PreAuthorize("hasAuthority('" + Permissions.SURCHARGE_MANAGE + "')")
public class AdminSurchargeController {

    static final String CATEGORIES =
            "EARLY_CHECK_IN|LATE_CHECK_OUT|EXTRA_ADULT|EXTRA_CHILD|EXTRA_BED|HOLIDAY|OTHER";
    static final String CALCULATIONS =
            "PER_STAY|PER_NIGHT|PER_PERSON_PER_NIGHT|PER_PERSON_PER_STAY|PERCENT_OF_ROOM_RATE";
    private static final String ENTITY = "surcharge";

    static final String COLUMNS = """
            s.id, s.property_id, p.slug AS property_slug,
            COALESCE(t.name, p.slug) AS property_name,
            s.code, s.name, s.description, s.category, s.calculation, s.amount_minor, s.percent,
            s.currency, s.check_in_from, s.check_in_to, s.check_out_from, s.check_out_to,
            s.min_age, s.max_age, s.above_standard_occupancy, s.stay_from, s.stay_to,
            s.days_of_week, s.min_nights, s.condition_note, s.status, s.is_preset, s.sort_order,
            s.version, s.updated_at
            """;
    static final String FROM = """
            FROM surcharge s
            LEFT JOIN property p ON p.id = s.property_id
            LEFT JOIN property_translation t ON t.property_id = p.id AND t.locale = 'vi'
            """;

    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public AdminSurchargeController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * Every surcharge, or — with {@code propertyId} — the all-hotels ones plus that
     * hotel's own. {@code scope=GLOBAL} limits the list to the all-hotels ones.
     */
    @GetMapping
    public List<SurchargeView> list(@RequestParam(required = false) UUID propertyId,
                                    @RequestParam(required = false) String scope) {
        boolean globalOnly = "GLOBAL".equalsIgnoreCase(scope);
        return jdbc.sql("SELECT " + COLUMNS + FROM + """
                 WHERE (:globalOnly = false OR s.property_id IS NULL)
                   AND (CAST(:propertyId AS uuid) IS NULL OR s.property_id IS NULL
                        OR s.property_id = CAST(:propertyId AS uuid))
                 ORDER BY s.property_id NULLS FIRST, property_name, s.sort_order, s.name, s.id
                """)
                .param("globalOnly", globalOnly)
                .param("propertyId", propertyId)
                .query((rs, row) -> view(rs))
                .list();
    }

    @GetMapping("/{id}")
    public SurchargeView get(@PathVariable UUID id) {
        return find(id).orElseThrow(AdminSurchargeController::notFound);
    }

    @PostMapping
    @Transactional
    public SurchargeView create(@Valid @RequestBody SurchargeRequest request) {
        validate(request);
        requirePropertyExists(request.propertyId());
        UUID actor = CurrentActor.require().userId();
        UUID id;
        try {
            id = jdbc.sql("""
                    INSERT INTO surcharge (property_id, code, name, description, category, calculation,
                        amount_minor, percent, currency, check_in_from, check_in_to, check_out_from,
                        check_out_to, min_age, max_age, above_standard_occupancy, stay_from, stay_to,
                        days_of_week, min_nights, condition_note, status, sort_order,
                        created_by, updated_by)
                    VALUES (:propertyId, :code, :name, :description, :category, :calculation,
                        :amount, :percent, :currency, :checkInFrom, :checkInTo, :checkOutFrom,
                        :checkOutTo, :minAge, :maxAge, :aboveStandard, :stayFrom, :stayTo,
                        CAST(:days AS smallint[]), :minNights, :conditionNote, :status, :sortOrder,
                        :actor, :actor)
                    RETURNING id
                    """)
                    .paramSource(params(request).addValue("actor", actor))
                    .query(UUID.class)
                    .single();
        } catch (DuplicateKeyException duplicate) {
            throw duplicateCode();
        }
        SurchargeView created = get(id);
        record("surcharge.created", id, null, snapshot(created));
        return created;
    }

    /** Replaces every editable field. {@code version} must match, or 409. */
    @PutMapping("/{id}")
    @Transactional
    public SurchargeView update(@PathVariable UUID id, @Valid @RequestBody SurchargeRequest request) {
        validate(request);
        SurchargeView before = get(id);
        if (request.version() == null) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "version is required");
        }
        if (before.preset() && !before.code().equals(request.code())) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "The code of a preset surcharge cannot be changed");
        }
        requirePropertyExists(request.propertyId());
        int changed;
        try {
            changed = jdbc.sql("""
                    UPDATE surcharge SET property_id = :propertyId, code = :code, name = :name,
                        description = :description, category = :category, calculation = :calculation,
                        amount_minor = :amount, percent = :percent, currency = :currency,
                        check_in_from = :checkInFrom, check_in_to = :checkInTo,
                        check_out_from = :checkOutFrom, check_out_to = :checkOutTo,
                        min_age = :minAge, max_age = :maxAge, above_standard_occupancy = :aboveStandard,
                        stay_from = :stayFrom, stay_to = :stayTo, days_of_week = CAST(:days AS smallint[]),
                        min_nights = :minNights, condition_note = :conditionNote, status = :status,
                        sort_order = :sortOrder, version = version + 1, updated_at = now(),
                        updated_by = :actor
                     WHERE id = :id AND version = :version
                    """)
                    .paramSource(params(request)
                            .addValue("actor", CurrentActor.require().userId())
                            .addValue("id", id)
                            .addValue("version", request.version()))
                    .update();
        } catch (DuplicateKeyException duplicate) {
            throw duplicateCode();
        }
        if (changed == 0) {
            throw new KasException(ApiErrorCode.VERSION_CONFLICT,
                    "Someone else changed this surcharge. Reload and try again.");
        }
        SurchargeView after = get(id);
        record("surcharge.updated", id, snapshot(before), snapshot(after));
        return after;
    }

    @PatchMapping("/{id}/status")
    @Transactional
    public SurchargeView setStatus(@PathVariable UUID id, @Valid @RequestBody StatusChange request) {
        SurchargeView before = get(id);
        jdbc.sql("""
                UPDATE surcharge SET status = :status, version = version + 1, updated_at = now(),
                       updated_by = :actor
                 WHERE id = :id
                """)
                .param("status", request.status())
                .param("actor", CurrentActor.require().userId())
                .param("id", id)
                .update();
        SurchargeView after = get(id);
        record("surcharge.status_changed", id, Map.of("status", before.status()),
                Map.of("status", after.status()));
        return after;
    }

    /** Presets cannot be deleted — turn them off instead. */
    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable UUID id) {
        SurchargeView before = get(id);
        if (before.preset()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "A preset surcharge cannot be deleted; turn it off instead");
        }
        jdbc.sql("DELETE FROM surcharge WHERE id = :id").param("id", id).update();
        record("surcharge.deleted", id, snapshot(before), null);
    }

    // ------------------------------------------------------------------ helpers

    private Optional<SurchargeView> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE s.id = :id")
                .param("id", id)
                .query((rs, row) -> view(rs))
                .optional();
    }

    private void requirePropertyExists(UUID propertyId) {
        if (propertyId == null) {
            return;
        }
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM property WHERE id = :id)")
                .param("id", propertyId).query(Boolean.class).single();
        if (!exists) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, "The selected hotel does not exist");
        }
    }

    /** The cross-field rules the annotations cannot express. The table re-checks each one. */
    static void validate(SurchargeRequest r) {
        List<String> problems = new ArrayList<>();
        boolean percentBased = "PERCENT_OF_ROOM_RATE".equals(r.calculation());
        if (percentBased && r.percent() == null) {
            problems.add("A percentage surcharge needs a percent");
        }
        if (percentBased && r.amountMinor() != null) {
            problems.add("A percentage surcharge has no fixed amount");
        }
        if (!percentBased && r.amountMinor() == null) {
            problems.add("This surcharge needs an amount");
        }
        if (!percentBased && r.percent() != null) {
            problems.add("Only a percentage surcharge has a percent");
        }
        if (r.checkInFrom() != null && r.checkInTo() != null && !r.checkInFrom().isBefore(r.checkInTo())) {
            problems.add("Check-in window: 'from' must be before 'to'");
        }
        if (r.checkOutFrom() != null && r.checkOutTo() != null && !r.checkOutFrom().isBefore(r.checkOutTo())) {
            problems.add("Check-out window: 'from' must be before 'to'");
        }
        if (r.minAge() != null && r.maxAge() != null && r.minAge() > r.maxAge()) {
            problems.add("Minimum age is above maximum age");
        }
        if (r.stayFrom() != null && r.stayTo() != null && r.stayFrom().isAfter(r.stayTo())) {
            problems.add("Stay dates: start is after end");
        }
        if (!problems.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED, String.join("; ", problems));
        }
    }

    private static org.springframework.jdbc.core.namedparam.MapSqlParameterSource params(SurchargeRequest r) {
        Integer[] days = r.daysOfWeek() == null || r.daysOfWeek().isEmpty()
                ? null
                : r.daysOfWeek().stream().distinct().sorted().toArray(Integer[]::new);
        return new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("propertyId", r.propertyId())
                .addValue("code", r.code())
                .addValue("name", r.name().trim())
                .addValue("description", blankToNull(r.description()))
                .addValue("category", r.category())
                .addValue("calculation", r.calculation())
                .addValue("amount", r.amountMinor())
                .addValue("percent", r.percent())
                .addValue("currency", r.currency() == null ? "VND" : r.currency())
                .addValue("checkInFrom", r.checkInFrom())
                .addValue("checkInTo", r.checkInTo())
                .addValue("checkOutFrom", r.checkOutFrom())
                .addValue("checkOutTo", r.checkOutTo())
                .addValue("minAge", r.minAge())
                .addValue("maxAge", r.maxAge())
                .addValue("aboveStandard", Boolean.TRUE.equals(r.aboveStandardOccupancy()))
                .addValue("stayFrom", r.stayFrom())
                .addValue("stayTo", r.stayTo())
                .addValue("days", days)
                .addValue("minNights", r.minNights())
                .addValue("conditionNote", blankToNull(r.conditionNote()))
                .addValue("status", r.status() == null ? "ACTIVE" : r.status())
                .addValue("sortOrder", r.sortOrder() == null ? 100 : r.sortOrder());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    static SurchargeView view(ResultSet rs) throws SQLException {
        return new SurchargeView(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getString("property_slug"),
                rs.getObject("property_id") == null ? null : rs.getString("property_name"),
                rs.getString("code"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("category"),
                rs.getString("calculation"),
                rs.getObject("amount_minor", Long.class),
                rs.getBigDecimal("percent"),
                rs.getString("currency"),
                rs.getObject("check_in_from", LocalTime.class),
                rs.getObject("check_in_to", LocalTime.class),
                rs.getObject("check_out_from", LocalTime.class),
                rs.getObject("check_out_to", LocalTime.class),
                (Integer) intOrNull(rs, "min_age"),
                (Integer) intOrNull(rs, "max_age"),
                rs.getBoolean("above_standard_occupancy"),
                rs.getObject("stay_from", LocalDate.class),
                rs.getObject("stay_to", LocalDate.class),
                days(rs.getArray("days_of_week")),
                (Integer) intOrNull(rs, "min_nights"),
                rs.getString("condition_note"),
                rs.getString("status"),
                rs.getBoolean("is_preset"),
                rs.getInt("sort_order"),
                rs.getInt("version"));
    }

    private static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        return value == null ? null : ((Number) value).intValue();
    }

    static List<Integer> days(Array array) throws SQLException {
        if (array == null) {
            return List.of();
        }
        Object[] values = (Object[]) array.getArray();
        List<Integer> out = new ArrayList<>(values.length);
        for (Object value : values) {
            out.add(((Number) value).intValue());
        }
        return List.copyOf(out);
    }

    private static Map<String, Object> snapshot(SurchargeView v) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("propertyId", v.propertyId() == null ? null : v.propertyId().toString());
        out.put("code", v.code());
        out.put("name", v.name());
        out.put("calculation", v.calculation());
        out.put("amountMinor", v.amountMinor());
        out.put("percent", v.percent() == null ? null : v.percent().toPlainString());
        out.put("status", v.status());
        return out;
    }

    private void record(String action, UUID id, Map<String, Object> before, Map<String, Object> after) {
        KasPrincipal principal = CurrentActor.require();
        String role = principal.actor().roles().contains(UserRole.SUPER_ADMIN)
                ? UserRole.SUPER_ADMIN.name()
                : principal.actor().roles().stream().findFirst().map(Enum::name).orElse("UNKNOWN");
        audit.record(new AuditEvent(principal.userId(), role, action, ENTITY, id,
                before, after, null, null, null, CorrelationId.current(),
                CurrentActor.requireScope().toString()));
    }

    private static KasException notFound() {
        return new KasException(ApiErrorCode.NOT_FOUND, "Surcharge not found");
    }

    private static KasException duplicateCode() {
        return new KasException(ApiErrorCode.VALIDATION_FAILED,
                "This code is already used for the same hotel (or for all hotels)");
    }

    // ------------------------------------------------------------------ contract

    public record SurchargeRequest(
            /** Null = every hotel. */
            UUID propertyId,
            @NotBlank @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,63}$") String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 2000) String description,
            @NotBlank @Pattern(regexp = CATEGORIES) String category,
            @NotBlank @Pattern(regexp = CALCULATIONS) String calculation,
            @PositiveOrZero Long amountMinor,
            @DecimalMin("0.01") @DecimalMax("100") BigDecimal percent,
            @Pattern(regexp = "VND|USD") String currency,
            LocalTime checkInFrom,
            LocalTime checkInTo,
            LocalTime checkOutFrom,
            LocalTime checkOutTo,
            @Min(0) @Max(120) Integer minAge,
            @Min(0) @Max(120) Integer maxAge,
            Boolean aboveStandardOccupancy,
            LocalDate stayFrom,
            LocalDate stayTo,
            @Size(max = 7) List<@NotNull @Min(1) @Max(7) Integer> daysOfWeek,
            @Min(1) @Max(365) Integer minNights,
            @Size(max = 1000) String conditionNote,
            @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            @Min(0) @Max(10000) Integer sortOrder,
            /** Required on update; ignored on create. */
            Integer version) {
    }

    public record StatusChange(@NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
    }

    public record SurchargeView(
            UUID id,
            UUID propertyId,
            String propertySlug,
            String propertyName,
            String code,
            String name,
            String description,
            String category,
            String calculation,
            Long amountMinor,
            BigDecimal percent,
            String currency,
            LocalTime checkInFrom,
            LocalTime checkInTo,
            LocalTime checkOutFrom,
            LocalTime checkOutTo,
            Integer minAge,
            Integer maxAge,
            boolean aboveStandardOccupancy,
            LocalDate stayFrom,
            LocalDate stayTo,
            List<Integer> daysOfWeek,
            Integer minNights,
            String conditionNote,
            String status,
            boolean preset,
            int sortOrder,
            int version) {
    }
}
