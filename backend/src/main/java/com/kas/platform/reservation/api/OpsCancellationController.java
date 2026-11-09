package com.kas.platform.reservation.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.reservation.CustomerCancellationService;
import com.kas.platform.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Digits;
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
import java.math.BigDecimal;

/**
 * Hotel operations for responding to late cancellation requests.
 *
 * <p>Under {@code /api/v1/admin/ops} like every other operations route. It used
 * to sit at {@code /api/v1/ops/**}, which the security chain never opened, so
 * every request ended in its final {@code denyAll()} and no hotel could quote a
 * fee.
 */
@RestController
@RequestMapping("/api/v1/admin/ops/reservations/cancellation-requests")
@PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CANCEL + "')")
public class OpsCancellationController {

    private final CustomerCancellationService cancellations;

    public OpsCancellationController(CustomerCancellationService cancellations) {
        this.cancellations = cancellations;
    }

    @GetMapping
    public List<CustomerCancellationService.PendingCancellation> pending() {
        return cancellations.pendingHotelQuotes(CurrentActor.requireScope());
    }

    @PostMapping("/{reference}/{requestId}/fee")
    public CustomerCancellationService.CancellationResult quoteFee(
            @PathVariable String reference, @PathVariable UUID requestId,
            @Valid @RequestBody FeeQuote quote) {
        return cancellations.quoteFee(reference, requestId,
                quote.feeMinor() == null ? null : quote.feeMinor().longValueExact(), quote.percentage(), quote.note(),
                CurrentActor.require().actor());
    }

    /** Exactly one of feeMinor and percentage is required; legacy amount quotes remain valid. */
    public record FeeQuote(@PositiveOrZero @Digits(integer = 19, fraction = 0)
                           @DecimalMax("9223372036854775807") BigDecimal feeMinor, BigDecimal percentage,
                           @Size(max = 1000) String note) { }
}
