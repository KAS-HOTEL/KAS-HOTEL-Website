package com.kas.platform.security.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CustomerRegistrationRequest(
        @NotBlank @Size(max = 200) String fullName,
        @NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Size(min = 3, max = 32) String phone,
        @NotBlank @Size(min = 8, max = 200) String password,
        @Pattern(regexp = "vi|en") String locale,
        @Pattern(regexp = "[A-Za-z]{2}") String country) {}
