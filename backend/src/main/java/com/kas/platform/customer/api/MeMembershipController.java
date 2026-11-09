package com.kas.platform.customer.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.customer.MembershipTierService;
import com.kas.platform.security.CurrentActor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * The signed-in member's tier progress this quarter (V59), for My KAS: current tier, qualifying
 * bookings counted this quarter, and how many more reach the next tier.
 */
@RestController
@RequestMapping("/api/v1/me/membership")
@PreAuthorize("isAuthenticated()")
public class MeMembershipController {

    private final JdbcClient jdbc;
    private final MembershipTierService tiers;

    public MeMembershipController(JdbcClient jdbc, MembershipTierService tiers) {
        this.jdbc = jdbc;
        this.tiers = tiers;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.ME_STAY_VIEW + "')")
    public MembershipTierService.Progress progress() {
        UUID userId = CurrentActor.require().userId();
        UUID membership = jdbc.sql("""
                        SELECT cm.id FROM customer c
                          JOIN customer_membership cm ON cm.customer_id = c.id AND cm.status = 'ACTIVE'
                         WHERE c.user_id = :user AND c.merged_into_id IS NULL
                        """)
                .param("user", userId).query(UUID.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Membership not found"));
        return tiers.progress(membership)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Membership not found"));
    }
}
