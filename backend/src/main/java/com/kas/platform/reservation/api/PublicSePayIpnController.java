package com.kas.platform.reservation.api;

import com.kas.platform.reservation.SePayGatewayService;
import com.kas.platform.security.PublicEndpoint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * SePay payment gateway IPN: SePay posts here when an order is paid.
 *
 * <p>Answers {@code 200 {"success": true}} once the notification is recorded, matched or
 * not, because an unmatched payment is a matter for staff, not for SePay to resend. A
 * paid IPN confirms nothing until SePay's order API backs it ({@code SePayGatewayService});
 * the {@code X-Secret-Key} header is optional (the sandbox does not send it) but refused
 * when present and wrong. SePay unreachable answers 503, an unexpected failure 500, so
 * the notification is not lost.
 */
@RestController
@RequestMapping("/api/v1/public/payments/sepay")
public class PublicSePayIpnController {
    private static final Logger log = LoggerFactory.getLogger(PublicSePayIpnController.class);
    private final SePayGatewayService gateway;

    public PublicSePayIpnController(SePayGatewayService gateway) {
        this.gateway = gateway;
    }

    @PostMapping(value = "/ipn", produces = MediaType.APPLICATION_JSON_VALUE)
    @PublicEndpoint(reason = "Server-to-server SePay IPN; a paid IPN is verified against SePay's order API before it confirms anything")
    public ResponseEntity<Map<String, Object>> ipn(
            @RequestHeader(value = "X-Secret-Key", required = false) String secretKey,
            @RequestBody(required = false) String body) {
        switch (gateway.authenticate(secretKey)) {
            case NOT_CONFIGURED -> {
                log.warn("SePay IPN received but KAS_SEPAY_MERCHANT_ID / KAS_SEPAY_SECRET_KEY are not set");
                return ResponseEntity.status(503).body(Map.of("success", false));
            }
            case REFUSED -> {
                log.warn("SePay IPN refused: wrong or missing X-Secret-Key");
                return ResponseEntity.status(401).body(Map.of("success", false));
            }
            case OK -> { }
        }
        if (body == null || body.isBlank()) return ResponseEntity.badRequest().body(Map.of("success", false));
        try {
            gateway.handleIpn(body);
        } catch (com.fasterxml.jackson.core.JsonProcessingException malformed) {
            log.warn("SePay IPN body is not JSON");
            return ResponseEntity.badRequest().body(Map.of("success", false));
        } catch (java.io.IOException unreadable) {
            return ResponseEntity.badRequest().body(Map.of("success", false));
        } catch (com.kas.platform.reservation.SePayOrderApi.UnavailableException unavailable) {
            log.warn("SePay IPN not processed, order API unavailable: {}", unavailable.getMessage());
            return ResponseEntity.status(503).body(Map.of("success", false));
        }
        return ResponseEntity.ok(Map.of("success", true));
    }
}
