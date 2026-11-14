package com.kas.platform.review.api;

import com.kas.platform.security.PublicEndpoint;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * First-party, moderated guest reviews: only APPROVED, not hidden, not deleted, newest first.
 * OTA aggregates are served separately as property ratings. Shown on the hotel and room pages
 * (2026-11-14) next to the OTA score.
 */
@RestController
@RequestMapping("/api/v1/public/reviews")
public class PublicGuestReviewController {
    private final JdbcClient jdbc;

    public PublicGuestReviewController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @PublicEndpoint(reason = "Published customer reviews are public hotel content")
    public List<GuestReview> list(@RequestParam String hotelKey) {
        return jdbc.sql("""
                SELECT r.overall, r.title, r.body, r.language, r.stay_month, r.published_at,
                       r.cleanliness, r.service, r.location, r.room, r.value,
                       c.full_name, coalesce(c.country, res.guest_country) AS country
                  FROM review r
                  JOIN property p ON p.id = r.property_id
                  LEFT JOIN customer c ON c.id = r.customer_id
                  LEFT JOIN reservation res ON res.id = r.reservation_id
                 WHERE p.frontend_key = :hotelKey AND r.status = 'APPROVED'
                   AND r.hidden_at IS NULL AND r.deleted_at IS NULL
                 ORDER BY r.published_at DESC, r.id DESC
                 LIMIT 30
                """)
                .param("hotelKey", hotelKey)
                .query((rs, row) -> new GuestReview(rs.getInt("overall"), rs.getString("title"),
                        rs.getString("body"), rs.getString("language"),
                        rs.getObject("stay_month", LocalDate.class),
                        rs.getTimestamp("published_at").toInstant(),
                        shortName(rs.getString("full_name"), rs.getString("country")),
                        (Integer) rs.getObject("cleanliness", Integer.class),
                        (Integer) rs.getObject("service", Integer.class),
                        (Integer) rs.getObject("location", Integer.class),
                        (Integer) rs.getObject("room", Integer.class),
                        (Integer) rs.getObject("value", Integer.class)))
                .list();
    }

    /**
     * The reviewer as a guest sees it on review sites: the given name and the family name's
     * initial, never the full name. Vietnamese names put the family name first ("Đinh Thị Anh
     * Thư" → "Thư Đ."), others last ("Josh Parker" → "Josh P."). Null when no name is known.
     */
    static String shortName(String fullName, String country) {
        if (fullName == null || fullName.isBlank()) return null;
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) return parts[0];
        boolean familyFirst = "VN".equalsIgnoreCase(country == null ? "" : country.trim());
        String given = familyFirst ? parts[parts.length - 1] : parts[0];
        String family = familyFirst ? parts[0] : parts[parts.length - 1];
        return given + " " + family.substring(0, family.offsetByCodePoints(0, 1)).toUpperCase() + ".";
    }

    /** Scores are 1–5; the detail scores are null when the guest left them out. */
    public record GuestReview(int rating, String title, String body,
                              String language, LocalDate stayMonth,
                              java.time.Instant publishedAt,
                              String reviewerName,
                              Integer cleanliness, Integer service, Integer location,
                              Integer room, Integer value) {}
}
