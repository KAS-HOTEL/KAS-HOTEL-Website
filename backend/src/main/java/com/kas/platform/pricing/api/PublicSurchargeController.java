package com.kas.platform.pricing.api;

import com.kas.platform.security.PublicEndpoint;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * The active surcharges a guest should know about, for one hotel or for all.
 *
 * <p>For a hotel, the all-hotels surcharges are returned together with the hotel's own;
 * where the hotel has its own surcharge with the same code, that one replaces the
 * all-hotels one. Only {@code ACTIVE} rows are returned, and nothing internal (who
 * changed it, version, preset flag).
 */
@RestController
@RequestMapping("/api/v1/public/surcharges")
public class PublicSurchargeController {

    private final JdbcClient jdbc;

    public PublicSurchargeController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @PublicEndpoint(reason = "Active surcharges are published hotel information, like the room rate")
    public List<PublicSurchargeView> list(@RequestParam(required = false) String property) {
        String slug = property == null || property.isBlank() ? null : property.trim();
        return jdbc.sql("""
                SELECT * FROM (
                    SELECT DISTINCT ON (s.code)
                           s.code, s.name, s.description, s.category, s.calculation, s.amount_minor,
                           s.percent, s.currency, s.check_in_from, s.check_in_to, s.check_out_from,
                           s.check_out_to, s.min_age, s.max_age, s.above_standard_occupancy,
                           s.stay_from, s.stay_to, s.days_of_week, s.min_nights, s.condition_note,
                           s.sort_order, s.status
                      FROM surcharge s
                      LEFT JOIN property p ON p.id = s.property_id
                     WHERE s.property_id IS NULL
                        OR (CAST(:slug AS text) IS NOT NULL AND p.slug = CAST(:slug AS text))
                     ORDER BY s.code, s.property_id NULLS LAST
                ) effective
                 WHERE status = 'ACTIVE'
                 ORDER BY sort_order, name
                """)
                .param("slug", slug)
                .query((rs, row) -> new PublicSurchargeView(
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
                        rs.getObject("min_age") == null ? null : rs.getInt("min_age"),
                        rs.getObject("max_age") == null ? null : rs.getInt("max_age"),
                        rs.getBoolean("above_standard_occupancy"),
                        rs.getObject("stay_from", LocalDate.class),
                        rs.getObject("stay_to", LocalDate.class),
                        AdminSurchargeController.days(rs.getArray("days_of_week")),
                        rs.getObject("min_nights") == null ? null : rs.getInt("min_nights"),
                        rs.getString("condition_note")))
                .list();
    }

    /**
     * A hotel-specific surcharge that is turned off hides the all-hotels one with the same
     * code for that hotel: the override is picked first, then filtered by status.
     */
    public record PublicSurchargeView(
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
            String conditionNote) {
    }
}
