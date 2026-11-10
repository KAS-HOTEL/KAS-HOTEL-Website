package com.kas.platform.inventory.api;

import com.kas.platform.pricing.StayAdjustmentService;
import com.kas.platform.shared.Money;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A voucher as a guest sees it on the booking pages: what it gives, its conditions, and for
 * this stay either the saving ({@code eligible}) or why it cannot be used yet ({@code reason},
 * a stable code the website words).
 */
public record VoucherView(
        String code,
        String name,
        String description,
        String type,
        BigDecimal valuePercent,
        Money valueAmount,
        String valueAddDescription,
        LocalDate validTo,
        Integer minNights,
        Money minTotal,
        LocalDate stayFrom,
        LocalDate stayTo,
        boolean eligible,
        String reason,
        Money saving) {

    public static VoucherView of(StayAdjustmentService.VoucherCheck check, String currency) {
        var v = check.voucher();
        int exponent = Money.VND.equals(currency) ? 0 : 2;
        return new VoucherView(v.code(), v.name(), v.description(), v.type(), v.valuePercent(),
                v.valueMinor() == null ? null : new Money(v.valueMinor(), currency, exponent),
                v.valueAddDescription(), v.validTo(), v.minNights(),
                v.minTotalMinor() == null ? null : new Money(v.minTotalMinor(), currency, exponent),
                v.stayFrom(), v.stayTo(), check.eligible(),
                check.reason() == null ? null : check.reason().name(),
                new Money(check.discountMinor(), currency, exponent));
    }
}
