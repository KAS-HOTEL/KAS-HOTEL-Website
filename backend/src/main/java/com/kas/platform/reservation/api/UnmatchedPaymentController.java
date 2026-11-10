package com.kas.platform.reservation.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.reservation.UnmatchedPaymentService;
import com.kas.platform.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * "Tiền chưa khớp đơn" (V66 layer 3): SePay payments that could not confirm a booking, for
 * SUPER_ADMIN to settle by hand (contact the guest, refund or rebook, then record it here).
 */
@RestController
@RequestMapping("/api/v1/admin/ops/payments/unmatched")
@PreAuthorize("hasAuthority('" + Permissions.PAYMENT_RECORD + "')")
public class UnmatchedPaymentController {

    private final UnmatchedPaymentService payments;

    public UnmatchedPaymentController(UnmatchedPaymentService payments) {
        this.payments = payments;
    }

    @GetMapping
    public List<UnmatchedPaymentService.UnmatchedPayment> list() {
        return payments.list(CurrentActor.requireScope());
    }

    @PostMapping("/{id}/resolve")
    public UnmatchedPaymentService.UnmatchedPayment resolve(@PathVariable UUID id,
                                                            @Valid @RequestBody Resolution body) {
        return payments.resolve(id, body.resolution(), body.note(), CurrentActor.requireScope());
    }

    /** {@code resolution}: REFUNDED (money sent back) or HANDLED (settled another way). */
    public record Resolution(@NotBlank String resolution, @NotBlank @Size(max = 2000) String note) { }
}
