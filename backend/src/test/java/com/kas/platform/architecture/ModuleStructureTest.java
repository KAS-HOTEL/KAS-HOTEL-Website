package com.kas.platform.architecture;

import com.kas.platform.KasApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spring Modulith boundary verification.
 *
 * <p>{@code verify()} fails on a cyclic dependency between modules, and on any
 * access to a module outside the {@code allowedDependencies} it declared in its
 * {@code package-info.java}. Those declarations are the executable form of the
 * modular monolith: without this test they would be documentation.
 */
class ModuleStructureTest {

    private static final ApplicationModules MODULES = ApplicationModules.of(KasApplication.class);

    @Test
    @DisplayName("module boundaries and declared dependencies hold")
    void moduleStructureIsValid() {
        MODULES.verify();
    }

    @Test
    @DisplayName("only meaningful foundation modules exist — no empty speculative ones")
    void onlyFoundationModulesExist() {
        var names = MODULES.stream().map(m -> m.getName()).toList();

        // The Phase 7.3 brief: "Do NOT blindly create all modules if the
        // documentation does not require them at foundation stage. Avoid empty
        // speculative modules." Modules arrive with behaviour, not before it.
        //
        // `catalog` was added in Phase 7.5 and is not speculative: it holds the
        // amenity vocabulary doc 03 §6 requires, and it is a separate module
        // because it is the one repository that legitimately takes no
        // AuthorizationScope — the catalog is global and owned by no partner.
        // `onboarding` was added in the Phase 7.5 continuation. It owns the
        // submission/review workflow and the controllers that drive it, which is
        // also what let AdminPropertyController move out of `security.api` —
        // the compromise doc 90 §7 recorded is now resolved.
        // `media` was added in Phase 7.5C. Doc 62 gives it its own domain — a
        // central library whose assets outlive any single attachment — and its
        // ownership rule is genuinely different from everything else: an asset
        // belongs to a partner directly (doc 85 §4.3), not through a property.
        //
        // `reservation` arrives in Phase 7.5F Step 16A, on exactly the condition
        // this comment always attached to it: WITH behaviour. It owns
        // POST /public/reservations/requests and the S1 transaction of doc 54 §4 —
        // reference, price snapshot, request holds, SLA deadline, lines, history
        // and the durable idempotency record. It is not speculative and it is not
        // empty. Its allowed dependencies keep the ownership rules intact: it may
        // see `inventory` and `pricing`, and neither may see it, because doc 55 §1
        // makes inventory the single availability engine for every channel and
        // doc 56 §1 keeps rate management independent of Direct Sales.
        //
        // Still absent, still for the same reason: sales, notification and payment.
        //
        // `inventory` and `pricing` arrive in Phase 7.5E, with behaviour rather
        // than before it. They are two modules and not one because doc 56 §1
        // makes the separation a business rule, not a packaging preference:
        // "Central Rate Management is independent of the Direct Sales CRM. Rates
        // are a property-level commercial asset consumed by every channel."
        // Doc 55 §1 gives inventory the matching role — "the single availability
        // engine for every channel". Availability depends on price only to
        // answer "from what nightly rate", which is why `inventory` may see
        // `pricing` and not the reverse.
        //
        // `customer`, `review`, `voucher` and `integration` arrived with their admin
        // and customer screens (doc 155), each owning its own tables and routes.
        assertThat(names).containsExactlyInAnyOrder(
                "shared", "identity", "partner", "property", "catalog", "onboarding", "media",
                "inventory", "pricing", "reservation", "settings", "audit", "security", "web",
                "customer", "review", "voucher", "integration");
    }
}
