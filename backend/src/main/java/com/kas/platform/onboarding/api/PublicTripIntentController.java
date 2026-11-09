package com.kas.platform.onboarding.api;

import com.kas.platform.property.PublicTripIntent;
import com.kas.platform.property.TripIntentRepository;
import com.kas.platform.security.PublicEndpoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Public, localized Find Your KAS groups and their currently visible hotels. */
@RestController
@RequestMapping("/api/v1/public/trip-intents")
public class PublicTripIntentController {

    private final TripIntentRepository intents;

    public PublicTripIntentController(TripIntentRepository intents) {
        this.intents = intents;
    }

    @GetMapping
    @PublicEndpoint(reason = "Find Your KAS editorial groups are public catalog data")
    public List<PublicTripIntent> list(@RequestParam(defaultValue = "en") String locale) {
        return intents.findPublic(locale);
    }
}
