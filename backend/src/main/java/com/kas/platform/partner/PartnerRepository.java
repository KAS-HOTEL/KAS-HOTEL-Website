package com.kas.platform.partner;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads partners, always within the caller's scope.
 *
 * <p>Doc 52 §3.0 puts partner administration under {@code SUPER_ADMIN}. A
 * {@code PARTNER}-scoped actor therefore reaches exactly one partner — their
 * own — and a {@code PROPERTY}- or {@code OWN}-scoped actor reaches none.
 */
@Repository
public class PartnerRepository implements ScopedRepository {

    private static final String COLUMNS =
            "id, code, legal_name, display_name, status, created_at, updated_at";

    private final JdbcClient jdbc;

    public PartnerRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Returns empty when the partner does not exist <em>or</em> lies outside the
     * caller's scope. The caller maps both to 404 — doc 85 §6.3 requires that
     * another partner's existence is not disclosed.
     */
    public Optional<Partner> findById(UUID id, AuthorizationScope scope) {
        if (!reaches(id, scope)) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM partner WHERE id = :id")
                .param("id", id)
                .query(PartnerRepository::map)
                .optional();
    }

    public List<Partner> findAll(AuthorizationScope scope) {
        return switch (scope.kind()) {
            case GLOBAL -> jdbc.sql("SELECT " + COLUMNS + " FROM partner ORDER BY code")
                    .query(PartnerRepository::map).list();
            case PARTNER -> jdbc.sql("SELECT " + COLUMNS + " FROM partner WHERE id = :id")
                    .param("id", scope.partnerId())
                    .query(PartnerRepository::map).list();
            // Property-scoped staff and customers administer no partner.
            case PROPERTY, OWN -> List.of();
        };
    }

    private static boolean reaches(UUID partnerId, AuthorizationScope scope) {
        return scope.kind() == ScopeKind.GLOBAL
                || (scope.kind() == ScopeKind.PARTNER && scope.partnerId().equals(partnerId));
    }

    private static Partner map(ResultSet rs, int rowNum) throws SQLException {
        return new Partner(
                rs.getObject("id", UUID.class),
                rs.getString("code"),
                rs.getString("legal_name"),
                rs.getString("display_name"),
                PartnerStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }
}
