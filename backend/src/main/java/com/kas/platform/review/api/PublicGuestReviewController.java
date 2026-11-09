package com.kas.platform.review.api;

import com.kas.platform.security.PublicEndpoint;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** First-party, moderated guest reviews. OTA aggregates are served separately as property ratings. */
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
                SELECT r.overall, r.title, r.body, r.language, r.stay_month, r.published_at
                  FROM review r
                  JOIN property p ON p.id = r.property_id
                 WHERE p.frontend_key = :hotelKey AND r.status = 'APPROVED'
                   AND r.hidden_at IS NULL AND r.deleted_at IS NULL
                 ORDER BY r.published_at DESC, r.id DESC
                 LIMIT 30
                """)
                .param("hotelKey", hotelKey)
                .query((rs, row) -> new GuestReview(rs.getInt("overall"), rs.getString("title"),
                        rs.getString("body"), rs.getString("language"),
                        rs.getObject("stay_month", LocalDate.class),
                        rs.getTimestamp("published_at").toInstant()))
                .list();
    }

    public record GuestReview(int rating, String title, String body,
                              String language, LocalDate stayMonth,
                              java.time.Instant publishedAt) {}
}
