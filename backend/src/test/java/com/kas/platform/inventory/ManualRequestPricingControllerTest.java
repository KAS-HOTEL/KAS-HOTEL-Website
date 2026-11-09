package com.kas.platform.inventory;

import com.kas.platform.inventory.api.PublicAvailabilityController;
import com.kas.platform.inventory.api.RequestRoomOptionView;
import com.kas.platform.shared.Money;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDate;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ManualRequestPricingControllerTest {
    @Test void priceEndpointExposesNoRoomStock() throws Exception {
        AvailabilityService pricing = mock(AvailabilityService.class);
        when(pricing.requestOptions("hotel", LocalDate.parse("2026-11-01"),
                LocalDate.parse("2026-11-03"), "vi"))
                .thenReturn(List.of(new RequestRoomOptionView("suite", "Suite", new Money(100_000, "VND", 0))));
        var mvc = MockMvcBuilders.standaloneSetup(new PublicAvailabilityController(pricing)).build();
        mvc.perform(get("/api/v1/public/request-pricing/properties/hotel")
                        .param("checkIn", "2026-11-01").param("checkOut", "2026-11-03").param("locale", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].roomTypeSlug").value("suite"))
                .andExpect(jsonPath("$[0].nightlyFrom.amountMinor").value(100_000))
                .andExpect(jsonPath("$[0].availableQuantity").doesNotExist())
                .andExpect(jsonPath("$[0].availableForWholeStay").doesNotExist())
                .andExpect(jsonPath("$[0].maxQuantitySelectable").doesNotExist());
    }

    @Test void oldAutomatedAvailabilityRouteIsNotMapped() throws Exception {
        AvailabilityService pricing = mock(AvailabilityService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new PublicAvailabilityController(pricing)).build();
        mvc.perform(get("/api/v1/public/availability/properties/hotel")
                        .param("checkIn", "2026-11-01").param("checkOut", "2026-11-03"))
                .andExpect(status().isNotFound());
        verifyNoInteractions(pricing);
    }
}
