package com.kas.platform.media.api;

import com.kas.platform.security.PublicEndpoint;
import com.kas.platform.media.SiteImageSlot;
import com.kas.platform.media.SiteImageSlotRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Published, enabled site image slots for public website rendering. */
@RestController
@RequestMapping("/api/v1/public/site-image-slots")
public class PublicSiteImageSlotController {
    private final SiteImageSlotRepository slots;

    public PublicSiteImageSlotController(SiteImageSlotRepository slots) {
        this.slots = slots;
    }

    @GetMapping
    @PublicEndpoint(reason = "Enabled website image references are public presentation data")
    public List<SiteImageSlot> list() {
        return slots.findPublic();
    }
}
