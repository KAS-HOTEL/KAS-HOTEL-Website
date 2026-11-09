package com.kas.platform.property;

import com.kas.platform.shared.scope.PublicReadRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * The guest-visible facilities of a property.
 *
 * <p>Two predicates, both carried in SQL rather than in a controller check:
 *
 * <ul>
 *   <li>the property must be publicly visible — the same three lifecycle states
 *       every sibling public query uses, so an unpublished hotel's facilities are
 *       unreachable for exactly the reason its page is;</li>
 *   <li>the facility must not be archived — archiving is how a facility leaves
 *       the page, and a row kept for history must not keep appearing.</li>
 * </ul>
 *
 * <p>The translation join is <strong>inner</strong>, matching
 * {@code PublishedPropertyRepository.findAmenities}: {@code name} is what makes a
 * facility renderable at all, so a facility with no text in the reader's locale is
 * omitted rather than shown as {@code RESTAURANT}. That is also why the guest list
 * can be shorter than the Partner's.
 */
@Repository
public class PublishedFacilityRepository implements PublicReadRepository {

    private static final String PROPERTY_PUBLICLY_VISIBLE =
            "p.lifecycle_state IN ('OPEN', 'COMING_SOON', 'TEMPORARILY_CLOSED')";

    private final JdbcClient jdbc;

    public PublishedFacilityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Facilities in the operator's own order, named in the reader's locale. */
    public List<PublicFacilityView> forProperty(String propertySlug, String locale) {
        return jdbc.sql("""
                        SELECT f.facility_type, t.name, t.description, f.open_to_non_residents
                          FROM facility f
                          JOIN property p ON p.id = f.property_id
                          JOIN facility_translation t
                            ON t.facility_id = f.id AND t.locale = :locale
                         WHERE p.slug = :slug
                           AND f.archived_at IS NULL
                           AND %s
                         ORDER BY f.sort_order, f.id
                        """.formatted(PROPERTY_PUBLICLY_VISIBLE))
                .param("slug", propertySlug)
                .param("locale", locale)
                .query((rs, rowNum) -> new PublicFacilityView(
                        FacilityType.valueOf(rs.getString("facility_type")),
                        rs.getString("name"),
                        rs.getString("description"),
                        (Boolean) rs.getObject("open_to_non_residents")))
                .list();
    }
}
