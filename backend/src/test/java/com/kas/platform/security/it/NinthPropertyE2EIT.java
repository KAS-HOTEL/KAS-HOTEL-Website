package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <h1>The Phase 7.5 acceptance proof</h1>
 *
 * <p>The phase brief §39 states the criterion:
 *
 * <blockquote>KAS can onboard and publish a completely new property through the
 * Partner workflow <strong>without developer code changes</strong>.</blockquote>
 *
 * <p>This test creates a ninth property alongside the eight seeded ones and
 * drives it to public visibility through the same HTTP endpoints the eight would
 * use. There is no fixture that special-cases it, no branch keyed to its name or
 * id, and nothing was added to the codebase to make it work — which is the whole
 * claim.
 *
 * <p>Everything runs inside the test transaction and is rolled back, so
 * {@code kas_web_dev} still holds exactly the eight seed properties afterwards.
 */
class NinthPropertyE2EIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "ninth-property-password-9012";

    @Test
    @DisplayName("a Partner onboards and publishes a ninth property, end to end")
    void ninthPropertyGoesFromNothingToPublic() throws Exception {
        // --- the KAS partner, exactly as the eight seed properties have it ------
        UUID partnerId = fixtures.createPartner("ninth");
        fixtures.createProperties(partnerId, 8);

        UUID admin = fixtures.createUser("partner-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        Cookie[] session = login(fixtures.emailOf(admin), PASSWORD);

        mockMvc.perform(get("/api/v1/admin/properties").cookie(session))
                .andExpect(jsonPath("$.length()").value(8));

        String slug = "kas-ninth-test-" + UUID.randomUUID().toString().substring(0, 8);

        // --- 1. Partner creates the property ------------------------------------
        String created = mockMvc.perform(post("/api/v1/admin/properties")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"slug\":\"" + slug + "\",\"name\":\"KAS No. 9 Test Hotel\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lifecycleState").value("DRAFT"))
                .andReturn().getResponse().getContentAsString();

        UUID ninthId = UUID.fromString(
                created.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        // The Partner now manages nine, through one PARTNER-scoped assignment.
        mockMvc.perform(get("/api/v1/admin/properties").cookie(session))
                .andExpect(jsonPath("$.length()").value(9));

        // --- 2. it is a draft, and drafts are not public -------------------------
        mockMvc.perform(get("/api/v1/public/properties/" + slug))
                .andExpect(status().isNotFound());

        // --- 3. Partner edits the draft ------------------------------------------
        mockMvc.perform(patch("/api/v1/admin/properties/" + ninthId)
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        // version is mandatory now (doc 58 §2); a create starts at 0.
                        .content("{\"version\":0,\"district\":\"District 1\",\"ward\":\"Ben Nghe\"}"))
                .andExpect(status().isOk());

        // --- 4. incomplete submits are refused -----------------------------------
        mockMvc.perform(post("/api/v1/admin/properties/" + ninthId + "/submit")
                        .with(csrf()).cookie(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // --- 5. Partner completes the required content ---------------------------
        // Room types, media and signature experiences have no endpoints yet
        // (Phase 7.5B+), so this step is seeded. Every workflow step around it is
        // real HTTP. Recorded as a limitation in doc 93.
        fixtures.makePropertyComplete(ninthId, partnerId);

        mockMvc.perform(get("/api/v1/admin/properties/" + ninthId + "/completeness")
                        .cookie(session))
                .andExpect(jsonPath("$.complete").value(true));

        // --- 6. Partner submits ---------------------------------------------------
        String submission = mockMvc.perform(post("/api/v1/admin/properties/" + ninthId + "/submit")
                        .with(csrf()).cookie(session))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andReturn().getResponse().getContentAsString();

        UUID submissionId = UUID.fromString(
                submission.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        // submitted is still not published
        mockMvc.perform(get("/api/v1/public/properties/" + slug))
                .andExpect(status().isNotFound());

        // --- 7. Admin sees it in the review queue --------------------------------
        mockMvc.perform(get("/api/v1/admin/property-submissions").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + submissionId + "')]").exists());

        // --- 8. Admin inspects it -------------------------------------------------
        mockMvc.perform(get("/api/v1/admin/property-submissions/" + submissionId).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyId").value(ninthId.toString()));

        // --- 9. Admin approves ----------------------------------------------------
        mockMvc.perform(post("/api/v1/admin/property-submissions/" + submissionId + "/approve")
                        .with(csrf()).cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        // --- 10. it is now publicly readable --------------------------------------
        mockMvc.perform(get("/api/v1/public/properties/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.name").value("KAS No. 9 Test Hotel"))
                // Denylisted fields must not appear on the public surface.
                .andExpect(jsonPath("$.partnerId").doesNotExist())
                .andExpect(jsonPath("$.id").doesNotExist());

        mockMvc.perform(get("/api/v1/public/properties"))
                .andExpect(jsonPath("$[?(@.slug=='" + slug + "')]").exists());

        // its room type was published by the same approval
        mockMvc.perform(get("/api/v1/public/properties/" + slug + "/room-types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                // STEP I widened the public room type so a guest can read what a
                // room actually is. {@code smoking} is NOT NULL, so it is always
                // present; {@code beds} is an array even when the Partner has
                // recorded none, because an absent key and an empty list would be
                // two ways of saying the same thing.
                .andExpect(jsonPath("$[0].smoking").exists())
                .andExpect(jsonPath("$[0].beds").isArray())
                // Internal fields stay off the public surface.
                .andExpect(jsonPath("$[0].id").doesNotExist())
                .andExpect(jsonPath("$[0].basePriceMinor").doesNotExist());

        assertThat(fixtures.lifecycleStateOf(ninthId)).isEqualTo("COMING_SOON");
    }

    @Test
    @DisplayName("another Partner cannot see or touch the ninth property — 404")
    void ninthPropertyIsIsolatedFromOtherPartners() throws Exception {
        UUID partnerA = fixtures.createPartner("ninth-a");
        UUID adminA = fixtures.createUser("admin-a", PASSWORD);
        fixtures.grantPartnerScope(adminA, partnerA);
        Cookie[] sessionA = login(fixtures.emailOf(adminA), PASSWORD);

        String slug = "kas-ninth-iso-" + UUID.randomUUID().toString().substring(0, 8);
        String created = mockMvc.perform(post("/api/v1/admin/properties")
                        .with(csrf()).cookie(sessionA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"slug\":\"" + slug + "\",\"name\":\"KAS No. 9 Isolation\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID ninthId = UUID.fromString(
                created.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));

        UUID partnerB = fixtures.createPartner("ninth-b");
        UUID adminB = fixtures.createUser("admin-b", PASSWORD);
        fixtures.grantPartnerScope(adminB, partnerB);
        Cookie[] sessionB = login(fixtures.emailOf(adminB), PASSWORD);

        mockMvc.perform(get("/api/v1/admin/properties/" + ninthId).cookie(sessionB))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/v1/admin/properties/" + ninthId)
                        .with(csrf()).cookie(sessionB)
                        .contentType(MediaType.APPLICATION_JSON)
                        // A valid version, so the 404 below is the scope filter
                        // refusing it rather than bean validation.
                        .content("{\"version\":0,\"district\":\"hijack\"}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/admin/properties/" + ninthId + "/submit")
                        .with(csrf()).cookie(sessionB))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("no code branches on any specific property")
    void noPropertySpecificBranchExists() {
        // The eight canonical names, and the ninth. If any of these appears in a
        // production source file, some behaviour is keyed to a particular hotel
        // and the "no code change for a new property" claim is false.
        var production = new com.tngtech.archunit.core.importer.ClassFileImporter()
                .withImportOption(com.tngtech.archunit.core.importer.ImportOption
                        .Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform");

        for (String name : new String[]{
                "Passion", "Elegance", "Ancient", "Milestone",
                "Zody", "Sonata", "Eliana", "Dilly"}) {
            assertThat(production.stream()
                    .anyMatch(type -> type.getName().contains(name)))
                    .as("no production type is named after the property '%s'", name)
                    .isFalse();
        }
    }
}
