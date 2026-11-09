package com.kas.platform.reservation.api;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.Permissions;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The single KAS payment account (V51): one QR and one bank account for every hotel.
 *
 * <p>SUPER_ADMIN only ({@code settings.manage}): it is the role that confirms payments,
 * and the account is platform-wide, so a hotel-scoped ADMIN cannot change where every
 * guest's money goes. Each change is audited with the values before and after.
 */
@RestController
@RequestMapping("/api/v1/admin/payment-account")
public class PaymentAccountController {
    private final JdbcClient jdbc;
    private final AuditLogger audit;

    public PaymentAccountController(JdbcClient jdbc, AuditLogger audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.SETTINGS_MANAGE + "')")
    public PaymentAccountRequest read() {
        return current().body();
    }

    @PutMapping
    @Transactional
    @PreAuthorize("hasAuthority('" + Permissions.SETTINGS_MANAGE + "')")
    public PaymentAccountRequest update(@Valid @RequestBody PaymentAccountRequest body, HttpServletRequest request) {
        validateQrUrl(body.qrImageUrl());
        Stored before = current();
        PaymentAccountRequest after = new PaymentAccountRequest(blankToNull(body.qrImageUrl()),
                blankToNull(body.instructions()), blankToNull(body.bankName()),
                blankToNull(body.accountHolder()), blankToNull(body.accountNumber()));
        var actor = CurrentActor.require();
        jdbc.sql("""
                UPDATE payment_account
                   SET qr_url = :qr, instructions = :instructions, bank_name = :bank,
                       account_holder = :holder, account_number = :number,
                       updated_at = now(), updated_by = :actor
                 WHERE id = :id
                """)
                .param("qr", after.qrImageUrl()).param("instructions", after.instructions())
                .param("bank", after.bankName()).param("holder", after.accountHolder())
                .param("number", after.accountNumber()).param("actor", actor.userId())
                .param("id", before.id()).update();
        audit.record(new AuditEvent(actor.userId(), "SUPER_ADMIN", "PAYMENT_ACCOUNT_UPDATED",
                "payment_account", before.id(), asMap(before.body()), asMap(after), null,
                request.getRemoteAddr(), request.getHeader("User-Agent"),
                CorrelationId.current(), actor.scope().kind().name()));
        return after;
    }

    private Stored current() {
        return jdbc.sql("""
                SELECT id, qr_url, instructions, bank_name, account_holder, account_number
                  FROM payment_account FOR UPDATE
                """)
                .query((rs, n) -> new Stored(rs.getObject("id", UUID.class), new PaymentAccountRequest(
                        rs.getString("qr_url"), rs.getString("instructions"), rs.getString("bank_name"),
                        rs.getString("account_holder"), rs.getString("account_number"))))
                .single();
    }

    private record Stored(UUID id, PaymentAccountRequest body) {
    }

    private static Map<String, Object> asMap(PaymentAccountRequest value) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("qrImageUrl", nz(value.qrImageUrl()));
        map.put("instructions", nz(value.instructions()));
        map.put("bankName", nz(value.bankName()));
        map.put("accountHolder", nz(value.accountHolder()));
        map.put("accountNumber", nz(value.accountNumber()));
        return map;
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static void validateQrUrl(String value) {
        if (value == null || value.isBlank()) return;
        try {
            URI uri = URI.create(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
                throw invalidQrUrl();
            }
        } catch (IllegalArgumentException invalid) {
            throw invalidQrUrl();
        }
    }

    private static KasException invalidQrUrl() {
        return new KasException(ApiErrorCode.VALIDATION_FAILED, "The QR image URL is invalid.",
                List.of(new KasException.ErrorDetail("qrImageUrl", "INVALID_URL",
                        "Use a public HTTPS URL.")));
    }
}
