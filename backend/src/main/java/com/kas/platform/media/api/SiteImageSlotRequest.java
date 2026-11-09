package com.kas.platform.media.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SiteImageSlotRequest(
        @Size(max = 2048) String imageReference,
        @NotNull Boolean enabled) {
}
