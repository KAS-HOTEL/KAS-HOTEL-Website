package com.kas.platform.onboarding.api;

import com.kas.platform.property.BedConfiguration;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One bed arrangement.
 *
 * <p>{@code bedType} is free text because the frozen schema stores it as
 * {@code text} with only a non-blank CHECK — there is no {@code bed_type} enum
 * and no bed catalogue. A controlled vocabulary here would be an invention, and
 * is raised as OQ-102 rather than assumed.
 */
public record BedConfigurationRequest(

        @NotBlank
        @Size(max = 80)
        String bedType,

        /** {@code room_type_bed_count_pos}. */
        @Min(1)
        int bedCount,

        boolean isDefault) {

    BedConfiguration toDomain(int sortOrder) {
        return new BedConfiguration(bedType, bedCount, isDefault, sortOrder);
    }
}
