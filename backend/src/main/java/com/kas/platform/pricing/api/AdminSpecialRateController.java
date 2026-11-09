package com.kas.platform.pricing.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.pricing.SpecialRateService;
import com.kas.platform.security.CurrentActor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * "Quy tắc đặc biệt" — holidays, seasons and weekday patterns with a fixed price per room
 * type. SUPER_ADMIN (rate permissions). See {@link SpecialRateService}.
 */
@RestController
@RequestMapping("/api/v1/admin/special-rates")
public class AdminSpecialRateController {

    private final SpecialRateService special;

    public AdminSpecialRateController(SpecialRateService special) {
        this.special = special;
    }

    public record PriceBody(UUID roomTypeId, long priceMinor) {
    }

    public record SpecialRateRequest(
            SpecialRateService.Kind kind,
            String name,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            List<Integer> daysOfWeek,
            List<PriceBody> prices) {

        SpecialRateService.Draft draft() {
            List<SpecialRateService.Price> list = prices == null ? List.of()
                    : prices.stream().map(p -> new SpecialRateService.Price(p.roomTypeId(), p.priceMinor())).toList();
            return new SpecialRateService.Draft(kind, name, dateFrom, dateTo, daysOfWeek, list);
        }
    }

    public record SpecialRateView(UUID id, UUID propertyId, String kind, String name, LocalDate dateFrom,
                                  LocalDate dateTo, List<Integer> daysOfWeek, boolean active,
                                  List<PriceBody> prices, List<UUID> ruleIds) {

        static SpecialRateView of(SpecialRateService.Group g) {
            return new SpecialRateView(g.id(), g.propertyId(), g.kind().name(), g.name(), g.dateFrom(), g.dateTo(),
                    g.daysOfWeek(), g.active(),
                    g.prices().entrySet().stream().map(e -> new PriceBody(e.getKey(), e.getValue())).toList(),
                    g.ruleIds());
        }
    }

    public record CellBody(UUID roomTypeId, LocalDate date) {
    }

    /** {@code amountMinor} null removes the day prices of the cells. */
    public record DayPricesRequest(List<CellBody> cells, Long amountMinor) {
    }

    public record DayPricesResult(int cells) {
    }

    /** Sets (or, with no amount, removes) the calendar price of many cells in one transaction. */
    @PutMapping("/day-prices")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public DayPricesResult dayPrices(@RequestBody DayPricesRequest request) {
        List<SpecialRateService.Cell> cells = request.cells() == null ? null
                : request.cells().stream()
                        .map(c -> c == null ? null : new SpecialRateService.Cell(c.roomTypeId(), c.date()))
                        .toList();
        return new DayPricesResult(special.applyDayPrices(cells, request.amountMinor(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.RATE_VIEW + "')")
    public List<SpecialRateView> list(@RequestParam UUID propertyId) {
        return special.list(propertyId, CurrentActor.requireScope()).stream().map(SpecialRateView::of).toList();
    }

    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public SpecialRateView create(@RequestParam UUID propertyId, @RequestBody SpecialRateRequest request) {
        return SpecialRateView.of(special.create(propertyId, request.draft(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @PutMapping("/{groupId}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public SpecialRateView update(@PathVariable UUID groupId, @RequestBody SpecialRateRequest request) {
        return SpecialRateView.of(special.update(groupId, request.draft(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @PatchMapping("/{groupId}/active")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    public SpecialRateView setActive(@PathVariable UUID groupId, @RequestParam boolean active) {
        return SpecialRateView.of(special.setActive(groupId, active,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @DeleteMapping("/{groupId}")
    @PreAuthorize("hasAuthority('" + Permissions.RATE_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@PathVariable UUID groupId) {
        special.archive(groupId, CurrentActor.require().actor(), CurrentActor.requireScope());
    }
}
