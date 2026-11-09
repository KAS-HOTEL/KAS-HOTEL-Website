package com.kas.platform.security;

import com.kas.platform.shared.EmailLanguage;
import com.kas.platform.shared.EmailOutboxService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/** Registration mail is sent after the registration transaction has returned. */
@Service
public class CustomerEmailNotifications {
    private final JdbcClient jdbc;
    private final EmailOutboxService outbox;
    private final String siteBase;

    public CustomerEmailNotifications(JdbcClient jdbc, EmailOutboxService outbox,
            @Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBase) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.siteBase = siteBase.replaceAll("/+$", "");
    }

    public void welcome(UUID userId) {
        jdbc.sql("SELECT id, email::text, full_name, country, customer_code FROM customer WHERE user_id=:user")
                .param("user", userId).query((rs, n) -> new Welcome(rs.getString("email"), rs.getString("full_name"),
                        rs.getString("country"), rs.getString("customer_code")))
                .optional().ifPresent(guest -> outbox.template("member-welcome-" + userId,
                        "MEMBER_WELCOME", guest.country(), guest.email(), guest.name(),
                        Map.of("firstName", guest.name(), "memberId", guest.code(), "memberTier", "Classic",
                                "accountUrl", siteBase + "/" + EmailLanguage.forCountry(guest.country()) + "/account/stays")));
    }

    private record Welcome(String email, String name, String country, String code) { }
}
