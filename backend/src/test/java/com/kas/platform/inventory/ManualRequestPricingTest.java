package com.kas.platform.inventory;

import com.kas.platform.pricing.PublishedRateRepository;
import com.kas.platform.property.BasePrice;
import com.kas.platform.settings.SystemSettingService;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ManualRequestPricingTest {
    private final PublishedAvailabilityRepository rooms = mock(PublishedAvailabilityRepository.class);
    private final PublishedRateRepository rates = mock(PublishedRateRepository.class);
    private final SystemSettingService settings = mock(SystemSettingService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-24T00:00:00Z"), ZoneOffset.UTC);
    private final AvailabilityService pricing = new AvailabilityService(rooms, rates, clock);
    private final UUID roomId = UUID.randomUUID();
    private final LocalDate in = LocalDate.of(2026, 11, 1);
    private final LocalDate out = in.plusDays(2);

    private void withRoom(List<String> slugs) {
        when(rooms.requestRooms("hotel", slugs)).thenReturn(List.of(new RequestRoom(roomId, "suite", 2, 0, 2)));
        when(rates.basePrices("hotel")).thenReturn(Map.of(roomId, new BasePrice(100_000, "VND")));
        when(rates.names("hotel", "vi")).thenReturn(Map.of(roomId, "Suite"));
    }

    @Test void pricingOptionsContainNoStockFieldsAndNeedNoStockSettings() {
        withRoom(null);
        var options = pricing.requestOptions("hotel", in, out, "vi");
        assertThat(options).hasSize(1);
        assertThat(options.getFirst().nightlyFrom().amountMinor()).isEqualTo(100_000);
        assertThat(java.util.Arrays.stream(options.getFirst().getClass().getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .containsExactly("roomTypeSlug", "name", "nightlyFrom");
        verify(rooms).requestRooms("hotel", null);
        verifyNoMoreInteractions(rooms);
        verifyNoInteractions(settings);
    }

    @Test void quoteAcceptsRequestedQuantityWithoutCheckingAvailableRoomsOrHorizon() {
        withRoom(List.of("suite"));
        var quote = pricing.quote("hotel", in, out, 12, 0, List.of(),
                List.of(new AvailabilityService.QuoteLine("suite", 6)), null, "vi");
        assertThat(quote.totalMinor()).isEqualTo(1_200_000);
        assertThat(quote.lines().getFirst().quantity()).isEqualTo(6);
        verify(rooms).requestRooms("hotel", List.of("suite"));
        verifyNoMoreInteractions(rooms);
        verifyNoInteractions(settings);
    }
}
