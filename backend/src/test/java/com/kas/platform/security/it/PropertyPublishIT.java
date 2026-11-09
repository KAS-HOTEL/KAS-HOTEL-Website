package com.kas.platform.security.it;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Step 16A.29 — {@code POST /admin/properties/{id}/publish}, the transition that
 * makes a hotel bookable.
 *
 * <p>Doc 58 §8 froze the route and {@code property.manage}; nothing performed it,
 * which is what Step 16A.26 found by running the product. The owner's OQ-101
 * ruling supplied the one missing rule: <strong>inventory and rates are business
 * inputs for sellability, not conditions of the lifecycle</strong>. Two tests
 * below hold that ruling in place.
 *
 * <p>Publishing does not make a property <em>visible</em> — {@code COMING_SOON}
 * already is. It makes it <em>bookable</em>, because {@code OPEN} is the only
 * state availability, rates and allocation will quote against.
 */
class PropertyPublishIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "property-publisher-password-6620";

    /** {@code createProperties} inserts at version 1; the fixtures below do not bump it. */
    private static final int FIXTURE_VERSION = 1;

    // ------------------------------------------------------------------ happy path

    @Test
    @DisplayName("a complete COMING_SOON property publishes to OPEN and is stamped")
    void publishesToOpen() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleState").value("OPEN"))
                // The version advances, so the caller's next write cannot be blind.
                .andExpect(jsonPath("$.version").value(FIXTURE_VERSION + 1));

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("OPEN");
        assertThat(fixtures.publishedAtOf(propertyId)).isNotNull();
    }

    // ------------------------------------------------- OQ-101, as ruled

    @Test
    @DisplayName("no inventory does not block publication — OQ-101")
    void inventoryIsNotAPrecondition() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        // Nothing has ever written an inventory day for this property.
        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleState").value("OPEN"));

        // The ruling's own consequence: OPEN with no inventory is valid, and the
        // guest surface answers with an empty availability list rather than an error.
        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("no rate does not block publication — OQ-101")
    void ratesAreNotAPrecondition() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        // Inventory but no rate: the other half of the same ruling.
        UUID roomTypeId = fixtures.roomTypeIdsOf(propertyId).getFirst();
        fixtures.setInventory(roomTypeId, java.time.LocalDate.now().plusDays(30), 5, 0, 0, 0);
        fixtures.clearBasePrice(roomTypeId);

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleState").value("OPEN"));
    }

    // ------------------------------------------------- doc 52 §3.1's last invariant

    @Test
    @DisplayName("a property whose rooms are all DRAFT cannot be published")
    void refusesWhenNoRoomTypeIsPublished() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        // Step 16A.32 found this hole: /publish took a property to OPEN while
        // every room stayed DRAFT, and availability and rates both require
        // rt.status = 'PUBLISHED' — so the hotel showed nothing and sold nothing.
        fixtures.roomTypeIdsOf(propertyId)
                .forEach(id -> fixtures.setRoomTypeStatus(id, "DRAFT"));

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("at least one published room type"));

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("COMING_SOON");
        assertThat(fixtures.publishedAtOf(propertyId)).isNull();
    }

    @Test
    @DisplayName("an archived room type does not count as published")
    void archivedRoomTypesDoNotCount() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);
        fixtures.roomTypeIdsOf(propertyId)
                .forEach(id -> fixtures.setRoomTypeStatus(id, "ARCHIVED"));

        // A withdrawn room is not an offer.
        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("at least one published room type"));
    }

    @Test
    @DisplayName("one published room type is enough")
    void onePublishedRoomTypeSuffices() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);
        UUID second = fixtures.addRoomType(propertyId, "extra-" + UUID.randomUUID());
        fixtures.setRoomTypeStatus(second, "DRAFT");

        // The invariant is "≥1 published", not "all published" — a hotel may hold
        // a room back while selling the rest.
        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleState").value("OPEN"));
    }

    // ------------------------------------------------------------------ the gate

    @Test
    @DisplayName("an incomplete property is refused with every missing field named")
    void refusesAnIncompleteProperty() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setLifecycle(propertyId, "COMING_SOON");

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[*].field")
                        .value(org.hamcrest.Matchers.hasItems(
                                "hero image", "at least one signature experience")));

        // Refused means unchanged — the checklist is a gate, not a warning.
        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("COMING_SOON");
        assertThat(fixtures.publishedAtOf(propertyId)).isNull();
    }

    @Test
    @DisplayName("a signature line another published property already uses is refused")
    void refusesADuplicateSignatureLine() throws Exception {
        Partner partner = partnerAccount();
        UUID first = readyToPublish(partner);
        UUID second = readyToPublish(partner);

        mockMvc.perform(publish(first, partner, FIXTURE_VERSION)).andExpect(status().isOk());

        // Doc 52 §3.1 — "signatureLine unique across published properties". The
        // fixture gives each property its own line, so this collision is deliberate.
        fixtures.setSignatureLine(second, "vi", fixtures.signatureLineOf(first, "vi"));

        mockMvc.perform(publish(second, partner, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("signatureLines.vi"))
                .andExpect(jsonPath("$.details[0].code").value("DUPLICATE"));

        assertThat(fixtures.lifecycleStateOf(second)).isEqualTo("COMING_SOON");
    }

    @Test
    @DisplayName("the duplicate check spans partners, because the portfolio a guest sees is one list")
    void uniquenessIsNotPartnerScoped() throws Exception {
        Partner mine = partnerAccount();
        Partner other = partnerAccount();
        UUID theirs = readyToPublish(other);
        UUID ours = readyToPublish(mine);

        mockMvc.perform(publish(theirs, other, FIXTURE_VERSION)).andExpect(status().isOk());
        fixtures.setSignatureLine(ours, "vi", fixtures.signatureLineOf(theirs, "vi"));

        mockMvc.perform(publish(ours, mine, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("signatureLines.vi"))
                // The error names our own locale and nothing about their property:
                // a uniqueness check must not become a way to read another
                // partner's editorial text.
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("kas-"))));
    }

    @Test
    @DisplayName("a complete DRAFT property publishes straight to OPEN — no approval in V1")
    void publishesAnUnreviewedProperty() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Thử");
        fixtures.makePropertyComplete(propertyId, partner.partnerId);
        // Left DRAFT: never submitted, never approved. Its rooms are DRAFT too,
        // because approval is what used to publish them.

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleState").value("OPEN"));

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("publishing from DRAFT publishes the property's room types with it")
    void publishesRoomTypesWhenPublishingFromDraft() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Thử");
        fixtures.makePropertyComplete(propertyId, partner.partnerId);

        // Without this the transition would be permitted and unreachable: a
        // Partner may not set PUBLISHED one room at a time (RoomTypeStatus
        // .isPartnerPermittedTransition), and approval is no longer on the path.
        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION)).andExpect(status().isOk());

        assertThat(fixtures.roomTypeIdsOf(propertyId)).isNotEmpty();
        assertThat(fixtures.publishedRoomTypeCountOf(propertyId)).isGreaterThan(0);
    }

    @Test
    @DisplayName("an incomplete DRAFT property is still refused, with every missing field named")
    void refusesAnIncompleteDraft() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Thử");
        // No checklist fixture: removing the approval step removed a workflow,
        // not the readiness rules doc 52 §3.1 freezes.

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details").isNotEmpty());

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("publishing an already-OPEN property is refused rather than re-stamped")
    void refusesToPublishTwice() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION)).andExpect(status().isOk());
        String stampedAt = fixtures.publishedAtOf(propertyId);

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION + 1))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        // published_at records first publication, and nothing moved it.
        assertThat(fixtures.publishedAtOf(propertyId)).isEqualTo(stampedAt);
    }

    // ------------------------------------------------------------------ concurrency

    @Test
    @DisplayName("a stale version is 409 and publishes nothing")
    void respectsTheOptimisticLock() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        mockMvc.perform(publish(propertyId, partner, FIXTURE_VERSION - 1))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("COMING_SOON");
        assertThat(fixtures.publishedAtOf(propertyId)).isNull();
    }

    @Test
    @DisplayName("the version is required — doc 58 §2")
    void requiresTheVersion() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        mockMvc.perform(post("/api/v1/admin/properties/" + propertyId + "/publish")
                        .with(csrf()).cookie(partner.session)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("COMING_SOON");
    }

    // ------------------------------------------------------------------ security

    @Test
    @DisplayName("the route is closed to anonymous callers and to a session without the permission")
    void routeIsNotOpen() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = readyToPublish(partner);

        mockMvc.perform(post("/api/v1/admin/properties/" + propertyId + "/publish")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1}"))
                .andExpect(status().isUnauthorized());

        UUID customer = fixtures.createUser("publish-customer", PASSWORD);
        fixtures.grantOwnScope(customer);
        Cookie[] session = login(fixtures.emailOf(customer), PASSWORD);

        mockMvc.perform(post("/api/v1/admin/properties/" + propertyId + "/publish")
                        .with(csrf()).cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1}"))
                .andExpect(status().isForbidden());

        assertThat(fixtures.lifecycleStateOf(propertyId)).isEqualTo("COMING_SOON");
    }

    @Test
    @DisplayName("another partner's property is 404, never 403, and stays unpublished")
    void cannotPublishAnotherPartnersProperty() throws Exception {
        Partner mine = partnerAccount();
        Partner other = partnerAccount();
        UUID theirs = readyToPublish(other);

        // Doc 85 §6.3 — a reference is an identifier, never a credential. A 403
        // here would confirm the property exists.
        mockMvc.perform(publish(theirs, mine, FIXTURE_VERSION))
                .andExpect(status().isNotFound());

        assertThat(fixtures.lifecycleStateOf(theirs)).isEqualTo("COMING_SOON");
        assertThat(fixtures.publishedAtOf(theirs)).isNull();
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("property-publisher", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    /**
     * A property that satisfies the whole checklist and has been approved.
     *
     * <p>Its room types are PUBLISHED because that is what approval does —
     * {@code OnboardingService.approve} calls {@code publishAllForProperty} — and
     * a property sitting at {@code COMING_SOON} has been approved by definition.
     * The fixture previously left them DRAFT, which is precisely the state doc 52
     * §3.1 forbids publishing from.
     */
    private UUID readyToPublish(Partner partner) {
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();
        fixtures.setPropertyNames(propertyId, "Khách sạn Thử");
        fixtures.makePropertyComplete(propertyId, partner.partnerId);
        fixtures.roomTypeIdsOf(propertyId).forEach(fixtures::publishRoomType);
        fixtures.setLifecycle(propertyId, "COMING_SOON");
        return propertyId;
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            publish(UUID propertyId, Partner partner, int version) {
        return post("/api/v1/admin/properties/" + propertyId + "/publish")
                .with(csrf()).cookie(partner.session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":" + version + "}");
    }
}
