/**
 * Central Rate Management.
 *
 * <p>Doc 56 §1, CONFIRMED: "Central Rate Management is <strong>independent of the
 * Direct Sales CRM</strong>. Rates are a property-level commercial asset consumed
 * by every channel. Sales applies vouchers and approved overrides; sales does not
 * set rates." That independence is why this is its own module rather than part of
 * {@code onboarding} or {@code inventory}.
 *
 * <h2>V1 is base pricing only</h2>
 *
 * <p>Doc 56 §1.3: "The domain is <em>capable</em> of rate plans, channel-specific
 * rates and restrictions; the V1 engine does not implement them." The two nullable
 * columns {@code channel_scope} and {@code rate_plan_id} are the seam — doc 56 §2:
 * "Adding channel-specific pricing later is <strong>data</strong>, not a
 * re-architecture."
 *
 * <h2>What this module deliberately does not do</h2>
 *
 * <ul>
 *   <li><strong>No tax calculation.</strong> Tax is <strong>outside KAS V1</strong> by owner
 *       decision of 2026-08-18 (doc 99 §12). V1 pricing is room rate, then voucher, then
 *       customer payable — no tax step. The {@code tax_rule} table stays in the frozen schema
 *       and nothing reads it. {@code TaxIsOutOfScopeForV1Test} keeps it that way.</li>
 *   <li><strong>No price snapshot, no reservation total.</strong> Doc 56 §5 writes
 *       the snapshot at {@code salesStatus = REQUESTED}, which belongs to the
 *       booking phase, not here.</li>
 *   <li><strong>No vouchers, no occupancy pricing, no extra-bed charge.</strong>
 *       Doc 56 §3 layers 2 and 3; configs B10, B11 and B23 are all OPEN.</li>
 *   <li><strong>No seeded price.</strong> Doc 56 §9 B6 — "Base rates per room type
 *       per property" — is OPEN. Not one number is supplied here.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Central Rate Management",
        allowedDependencies = {"shared", "partner", "property", "identity", "audit", "security",
                "web"})
package com.kas.platform.pricing;
