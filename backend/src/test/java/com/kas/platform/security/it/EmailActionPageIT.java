package com.kas.platform.security.it;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** KAS-008 / KAS-017: email links answer readable, styled pages, also when they fail. */
class EmailActionPageIT extends SecurityIntegrationTest {

    @Test void aUsedOrUnknownLinkAnswersAReadablePageNotJson() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/public/reservation-actions/qa-not-a-token-0000000000"))
                .andExpect(status().isNotFound()).andReturn();
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(result.getResponse().getContentType()).startsWith("text/html");
        assertThat(body).contains("<!doctype html>").contains("Liên kết này đã được sử dụng hoặc đã hết hạn.")
                .contains("This link has already been used or has expired.").doesNotContain("\"code\"");
        assertThat(result.getResponse().getHeader("Content-Security-Policy"))
                .contains("default-src 'none'").contains("style-src 'sha256-");
    }

    @Test void aPostOnAnUnknownLinkIsAlsoAPage() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/public/reservation-actions/qa-not-a-token-0000000000/approve").with(csrf()))
                .andExpect(status().isNotFound()).andReturn();
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("<main>");
    }

    @Test void theJsonApiKeepsTheStrictPolicy() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/public/trip-intents")).andExpect(status().isOk()).andReturn();
        assertThat(result.getResponse().getHeader("Content-Security-Policy"))
                .isEqualTo("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }
}
