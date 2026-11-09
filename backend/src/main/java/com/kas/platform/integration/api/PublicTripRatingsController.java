package com.kas.platform.integration.api;

import com.kas.platform.security.PublicEndpoint;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Published Trip.com aggregate scores for the Frontend hotel catalog. */
@RestController
@RequestMapping("/api/v1/public/trip-ratings")
public class PublicTripRatingsController {
    private final JdbcClient jdbc;

    public PublicTripRatingsController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    @PublicEndpoint(reason = "Trip.com aggregate score and source are public property information")
    public List<TripRating> list() {
        return jdbc.sql("""
                SELECT frontend_key, trip_com_rating, trip_com_review_count,
                       trip_com_source_url, trip_com_observed_on
                  FROM property
                 WHERE lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')
                   AND frontend_key IS NOT NULL AND trip_com_rating IS NOT NULL
                 ORDER BY frontend_key
                """)
                .query((rs, row) -> new TripRating(rs.getString("frontend_key"),
                        rs.getBigDecimal("trip_com_rating"), rs.getInt("trip_com_review_count"),
                        rs.getString("trip_com_source_url"), rs.getObject("trip_com_observed_on", LocalDate.class)))
                .list();
    }

    public record TripRating(String hotelKey, BigDecimal rating, int reviewCount,
                             String sourceUrl, LocalDate observedOn) {}
}
