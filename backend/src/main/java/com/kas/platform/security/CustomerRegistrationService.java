package com.kas.platform.security;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.IdentityRepository;
import com.kas.platform.shared.CorrelationId;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Creates a customer account using the same identity and session system as staff. */
@Service
public class CustomerRegistrationService {
    private final JdbcClient jdbc;
    private final IdentityRepository identity;
    private final PasswordEncoder passwords;
    private final AuditLogger audit;

    public CustomerRegistrationService(JdbcClient jdbc, IdentityRepository identity,
                                       PasswordEncoder passwords, AuditLogger audit) {
        this.jdbc = jdbc;
        this.identity = identity;
        this.passwords = passwords;
        this.audit = audit;
    }

    @Transactional
    public UUID register(Registration request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (identity.findByEmail(email).isPresent()) {
            throw com.kas.platform.shared.ConflictException.accountAlreadyExists();
        }
        if (request.password().length() < 8) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Password must contain at least 8 characters");
        }
        // The check above can lose a race with a concurrent registration; the unique
        // key on app_user.email is what decides, and it must read as the same 409.
        UUID userId = jdbc.sql("""
                INSERT INTO app_user (email, password_hash, status, full_name, phone, locale)
                VALUES (:email, :password, 'ACTIVE', :name, :phone, :locale)
                ON CONFLICT (email) DO NOTHING
                RETURNING id
                """)
                .param("email", email).param("password", passwords.encode(request.password()))
                .param("name", request.fullName().trim()).param("phone", request.phone().trim())
                .param("locale", request.locale() == null ? "en" : request.locale())
                .query(UUID.class).optional()
                .orElseThrow(com.kas.platform.shared.ConflictException::accountAlreadyExists);
        UUID customerId = jdbc.sql("""
                INSERT INTO customer (user_id, customer_code, full_name, email, phone, locale, country)
                VALUES (:user, 'KAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
                        :name, :email, :phone, :locale, :country)
                RETURNING id
                """)
                .param("user", userId).param("name", request.fullName().trim())
                .param("email", email).param("phone", request.phone().trim())
                .param("locale", request.locale() == null ? "en" : request.locale())
                .param("country", request.country() == null ? null : request.country().toUpperCase(Locale.ROOT))
                .query(UUID.class).single();
        UUID membershipId = jdbc.sql("""
                INSERT INTO customer_membership (customer_id, enrollment_source)
                VALUES (:customer, 'DIRECT_SIGNUP')
                RETURNING id
                """).param("customer", customerId).query(UUID.class).single();
        jdbc.sql("""
                INSERT INTO customer_membership_tier_history
                    (membership_id, tier_id, effective_from, change_reason)
                SELECT :membership, id, now(), 'Initial membership at customer registration'
                  FROM membership_tier
                 WHERE code = 'CLASSIC' AND status = 'ACTIVE'
                """).param("membership", membershipId).update();
        jdbc.sql("INSERT INTO cashback_account (customer_id) VALUES (:customer)")
                .param("customer", customerId).update();
        jdbc.sql("""
                INSERT INTO role_assignment (user_id, role, scope_kind)
                VALUES (:user, 'CUSTOMER', 'OWN')
                """).param("user", userId).update();
        audit.record(new AuditEvent(userId, "CUSTOMER", "CUSTOMER_REGISTERED", "customer",
                customerId, null, Map.of("email", email), null, null, null,
                CorrelationId.current(), "OWN"));
        return userId;
    }

    public record Registration(String fullName, String email, String phone,
                              String password, String locale, String country) {}
}
