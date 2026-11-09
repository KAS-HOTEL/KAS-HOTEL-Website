package com.kas.platform.media.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ExternalMediaRequest(
        @NotBlank @Size(max = 2048) String url,
        @NotBlank @Pattern(regexp = "image/(jpeg|png|webp|avif)") String mimeType,
        @NotBlank @Pattern(regexp = "EXTERIOR|LOBBY|ROOM|DINING|FACILITY|ROOFTOP|NEIGHBOURHOOD|DETAIL|STAFF|EVENT|DOCUMENT") String category,
        @NotNull AttachMediaRequest.OwnerType ownerType,
        @NotNull UUID ownerId,
        @jakarta.validation.constraints.PositiveOrZero int displayOrder,
        @NotBlank @Size(max = 500) String altTextVi,
        @NotBlank @Size(max = 500) String altTextEn) {}
