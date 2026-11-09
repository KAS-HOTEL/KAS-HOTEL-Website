package com.kas.platform.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CorsOriginsTest {

    @Test
    @DisplayName("parses a comma separated list, trims, drops blanks and duplicates")
    void parsesList() {
        assertThat(CorsOrigins.parse(" https://kasluxuryhotel.com, https://admin.kasluxuryhotel.com ,,"
                + "https://kasluxuryhotel.com, http://localhost:3001"))
                .containsExactly("https://kasluxuryhotel.com", "https://admin.kasluxuryhotel.com",
                        "http://localhost:3001");
    }

    @Test
    @DisplayName("empty or missing means no cross-origin access")
    void emptyMeansNone() {
        assertThat(CorsOrigins.parse("")).isEmpty();
        assertThat(CorsOrigins.parse(null)).isEmpty();
        assertThat(CorsOrigins.parse(" , ")).isEmpty();
    }

    @Test
    @DisplayName("a wildcard is refused because credentials are allowed")
    void wildcardRefused() {
        assertThatThrownBy(() -> CorsOrigins.parse("*")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CorsOrigins.parse("https://*.kasluxuryhotel.com"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("plain http is only for loopback hosts; paths and trailing slashes are refused")
    void malformedRefused() {
        assertThatThrownBy(() -> CorsOrigins.parse("http://kasluxuryhotel.com"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CorsOrigins.parse("https://kasluxuryhotel.com/"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CorsOrigins.parse("https://kasluxuryhotel.com/api"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CorsOrigins.parse("kasluxuryhotel.com"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> CorsOrigins.parse("https://user@kasluxuryhotel.com"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("scheme and host are normalised to lower case; the port is kept")
    void normalises() {
        assertThat(CorsOrigins.parse("HTTPS://Admin.KasLuxuryHotel.com:8443"))
                .containsExactly("https://admin.kasluxuryhotel.com:8443");
    }
}
