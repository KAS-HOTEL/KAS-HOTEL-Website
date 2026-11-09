package com.kas.platform.customer.api;

import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The signed-in member's saved hotels ("Lưu để xem sau").
 *
 * <p>Backed by {@code customer_favorite_property}, which has existed since V33
 * with its primary key on (customer, property) — so a hotel can be saved once
 * per account and no migration is needed. Saving and removing are idempotent:
 * a double click, two tabs or a retry all converge on the same state.
 *
 * <p>Hotels are addressed by their public slug, the same identifier the website
 * already uses for pricing. Only a hotel the public site shows may be saved; the
 * list itself drops a hotel that has since been withdrawn rather than failing.
 */
@RestController
@RequestMapping("/api/v1/me/favorites")
@PreAuthorize("isAuthenticated()")
public class MeFavoriteController {

    static final String VISIBLE = "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private final JdbcClient jdbc;

    public MeFavoriteController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Newest saved first. */
    @GetMapping
    public Favorites list() {
        UUID customerId = customerId();
        return new Favorites(jdbc.sql("""
                SELECT p.slug
                  FROM customer_favorite_property f
                  JOIN property p ON p.id = f.property_id
                 WHERE f.customer_id = :customer AND %s
                 ORDER BY f.created_at DESC, p.slug
                """.formatted(VISIBLE))
                .param("customer", customerId)
                .query(String.class)
                .list());
    }

    @PutMapping("/{slug}")
    @Transactional
    public Favorites save(@PathVariable String slug) {
        UUID customerId = customerId();
        int inserted = jdbc.sql("""
                INSERT INTO customer_favorite_property (customer_id, property_id)
                SELECT :customer, p.id FROM property p WHERE p.slug = :slug AND %s
                ON CONFLICT (customer_id, property_id) DO NOTHING
                """.formatted(VISIBLE))
                .param("customer", customerId)
                .param("slug", slug)
                .update();
        if (inserted == 0 && !visible(slug)) {
            throw new NotFoundException("Hotel not found");
        }
        return list();
    }

    @DeleteMapping("/{slug}")
    @Transactional
    public Favorites remove(@PathVariable String slug) {
        UUID customerId = customerId();
        jdbc.sql("""
                DELETE FROM customer_favorite_property f
                 USING property p
                 WHERE f.property_id = p.id AND f.customer_id = :customer AND p.slug = :slug
                """)
                .param("customer", customerId)
                .param("slug", slug)
                .update();
        return list();
    }

    private boolean visible(String slug) {
        return jdbc.sql("SELECT count(*) FROM property p WHERE p.slug = :slug AND " + VISIBLE)
                .param("slug", slug)
                .query(Long.class)
                .single() > 0;
    }

    /** The caller's customer row; a staff account has none and gets 404. */
    private UUID customerId() {
        UUID userId = CurrentActor.require().userId();
        return jdbc.sql("SELECT id FROM customer WHERE user_id = :user")
                .param("user", userId)
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> new NotFoundException("Customer profile not found"));
    }

    public record Favorites(List<String> propertySlugs) {
    }
}
