package com.kas.platform.security.it;

import com.kas.platform.property.PropertyRepository;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * OQ-132 — the admin property read returns the identity the admin write accepts.
 *
 * <p>The gap these tests close was a real one: {@code CreatePropertyRequest} took
 * a {@code name} and {@code UpdatePropertyRequest} took {@code district},
 * {@code ward}, {@code city} and {@code phone}, all on the frozen doc 58 §8
 * route — and {@code GET} returned none of them. An extranet could write a
 * hotel's address and then had no way to read it back.
 *
 * <p>So the central test here is a <strong>round trip</strong>: everything
 * asserted on the response was put there through the API itself, not through
 * fixture SQL. That is what makes it a symmetry test rather than a projection
 * test that happens to pass.
 */
class PropertyAdminViewIT extends SecurityIntegrationTest {

    private static final String PASSWORD = "property-admin-password-7731";

    @Autowired
    private PropertyRepository properties;

    @Test
    @DisplayName("every identity field the API accepts on write comes back on read")
    void writtenIdentityIsReadable() throws Exception {
        Partner partner = partnerAccount();

        String slug = "round-trip-" + UUID.randomUUID().toString().substring(0, 8);
        String created = mockMvc.perform(post("/api/v1/admin/properties")
                        .with(csrf()).cookie(partner.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"slug\":\"" + slug + "\",\"name\":\"Khách sạn Vòng Tròn\"}"))
                .andExpect(status().isCreated())
                // The create response already carries the name it was just given,
                // in both locales — the controller writes en and vi together.
                .andExpect(jsonPath("$.names.vi").value("Khách sạn Vòng Tròn"))
                .andExpect(jsonPath("$.names.en").value("Khách sạn Vòng Tròn"))
                .andReturn().getResponse().getContentAsString();

        UUID propertyId = idOf(created);

        mockMvc.perform(patch("/api/v1/admin/properties/" + propertyId)
                        .with(csrf()).cookie(partner.session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"version":0,
                                 "district":"Quận 1","ward":"Phường Bến Nghé",
                                 "city":"Hồ Chí Minh","phone":"+84 28 3822 0033"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.district").value("Quận 1"))
                .andExpect(jsonPath("$.ward").value("Phường Bến Nghé"))
                .andExpect(jsonPath("$.city").value("Hồ Chí Minh"))
                .andExpect(jsonPath("$.phone").value("+84 28 3822 0033"));

        // And again on a fresh GET, so nothing above is an echo of the request.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.names.vi").value("Khách sạn Vòng Tròn"))
                .andExpect(jsonPath("$.district").value("Quận 1"))
                .andExpect(jsonPath("$.ward").value("Phường Bến Nghé"))
                .andExpect(jsonPath("$.city").value("Hồ Chí Minh"))
                .andExpect(jsonPath("$.phone").value("+84 28 3822 0033"))
                .andExpect(jsonPath("$.lifecycleState").value("DRAFT"))
                .andExpect(jsonPath("$.isFlagship").value(false));
    }

    @Test
    @DisplayName("the list carries the same identity as the detail, for every row")
    void listCarriesIdentityToo() throws Exception {
        Partner partner = partnerAccount();
        List<UUID> owned = fixtures.createProperties(partner.partnerId, 3);
        fixtures.setPropertyNames(owned.get(1), "Khách sạn Thứ Hai");

        mockMvc.perform(get("/api/v1/admin/properties").cookie(partner.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // TEST_CITY comes from the fixture, so this also proves the list
                // projection reads the address columns rather than the detail
                // handler alone doing so.
                .andExpect(jsonPath("$[*].city").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("TEST_CITY"))))
                .andExpect(jsonPath("$[?(@.names.vi == 'Khách sạn Thứ Hai')]")
                        .value(org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("names are returned per locale, never resolved to one")
    void namesArePerLocale() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
        properties.setName(propertyId, "vi", "Khách sạn Sen Vàng", scope);
        properties.setName(propertyId, "en", "Golden Lotus Hotel", scope);

        // Doc 25 freezes two locales and this is an authoring surface: the server
        // must not pick one, because "the English name is missing" is exactly the
        // fact the Partner needs to see.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.names.vi").value("Khách sạn Sen Vàng"))
                .andExpect(jsonPath("$.names.en").value("Golden Lotus Hotel"));
    }

    @Test
    @DisplayName("a property with one locale returns one entry, not a filled-in second")
    void partialNamesAreReportedHonestly() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner.partnerId);
        properties.setName(propertyId, "vi", "Chỉ Tiếng Việt", scope);

        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.names.vi").value("Chỉ Tiếng Việt"))
                .andExpect(jsonPath("$.names.en").doesNotExist())
                .andExpect(jsonPath("$.names.length()").value(1));
    }

    @Test
    @DisplayName("a property with no name returns an empty map, not a missing key")
    void namesAreAlwaysPresent() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // An empty object says "no name has been written"; an absent key would be
        // indistinguishable from a field the caller forgot to ask for.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.names").isMap())
                .andExpect(jsonPath("$.names.length()").value(0));
    }

    @Test
    @DisplayName("unset optional fields are omitted rather than sent as null")
    void unsetFieldsAreOmitted() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // spring.jackson.default-property-inclusion: non_null. The frontend types
        // these as optional because of this, not as a defensive guess.
        mockMvc.perform(get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.district").doesNotExist())
                .andExpect(jsonPath("$.ward").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.city").exists());
    }

    @Test
    @DisplayName("partnerId is never on the wire, on either shape")
    void partnerIdIsNeverExposed() throws Exception {
        Partner partner = partnerAccount();
        UUID propertyId = fixtures.createProperties(partner.partnerId, 1).getFirst();

        // Doc 58 §9 PARTNER group. The field is absent from the record entirely,
        // so this is a regression guard rather than a filter being trusted.
        String detail = mockMvc.perform(
                        get("/api/v1/admin/properties/" + propertyId).cookie(partner.session))
                .andExpect(jsonPath("$.partnerId").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(detail).doesNotContain(partner.partnerId.toString());

        String list = mockMvc.perform(get("/api/v1/admin/properties").cookie(partner.session))
                .andExpect(jsonPath("$[0].partnerId").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain(partner.partnerId.toString());
    }

    @Test
    @DisplayName("the enriched response does not weaken cross-partner isolation")
    void crossPartnerStillReturns404() throws Exception {
        Partner partnerA = partnerAccount();
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID theirs = fixtures.createProperties(partnerB, 1).getFirst();
        fixtures.setPropertyNames(theirs, "Khách sạn Của Người Khác");

        // Doc 85 §6.3 — 404, not 403, and above all not a body containing the
        // other partner's hotel name now that names are returned at all.
        String body = mockMvc.perform(
                        get("/api/v1/admin/properties/" + theirs).cookie(partnerA.session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("Khách sạn Của Người Khác");
    }

    @Test
    @DisplayName("the name lookup is scoped at the repository, not only at the controller")
    void nameLookupIsScoped() {
        UUID partnerA = fixtures.createPartner("a-" + UUID.randomUUID().toString().substring(0, 6));
        UUID partnerB = fixtures.createPartner("b-" + UUID.randomUUID().toString().substring(0, 6));
        UUID mine = fixtures.createProperties(partnerA, 1).getFirst();
        UUID theirs = fixtures.createProperties(partnerB, 1).getFirst();

        AuthorizationScope scopeA = AuthorizationScope.partner(UUID.randomUUID(), partnerA);
        properties.setName(mine, "vi", "Của Tôi", scopeA);
        fixtures.setPropertyNames(theirs, "Của Họ");

        // Asking for both ids at once with Partner A's scope must return only A's.
        // A batch lookup that trusted its argument list would leak here, and the
        // controller would never know.
        Map<UUID, Map<String, String>> names =
                properties.findNames(List.of(mine, theirs), scopeA);

        assertThat(names).containsOnlyKeys(mine);
        assertThat(names.get(mine)).containsEntry("vi", "Của Tôi");
    }

    @Test
    @DisplayName("an empty id list asks the database nothing and returns nothing")
    void emptyLookupIsNotAQuery() {
        UUID partner = fixtures.createPartner("e-" + UUID.randomUUID().toString().substring(0, 6));
        AuthorizationScope scope = AuthorizationScope.partner(UUID.randomUUID(), partner);

        // A list endpoint for a partner with no properties must not build an
        // `IN ()` clause, which is a syntax error in PostgreSQL.
        assertThat(properties.findNames(List.of(), scope)).isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private record Partner(UUID partnerId, Cookie[] session) {
    }

    private Partner partnerAccount() throws Exception {
        UUID partnerId = fixtures.createPartner("p-" + UUID.randomUUID().toString().substring(0, 6));
        UUID admin = fixtures.createUser("property-admin", PASSWORD);
        fixtures.grantPartnerScope(admin, partnerId);
        return new Partner(partnerId, login(fixtures.emailOf(admin), PASSWORD));
    }

    private static UUID idOf(String body) {
        return UUID.fromString(body.replaceAll("^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1"));
    }
}
