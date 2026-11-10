package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * <h2>Superseded 2026-11-09 — read this first</h2>
 * <p>The owner approved the booking-price demo with <strong>VAT 8% and no service charge</strong>
 * and asked for it live (docs/kas/159). VAT is now applied by
 * {@code pricing.StayAdjustmentService} from {@code tax_rule} (V62 seeds one global VAT 8% row),
 * snapshotted on every booking ({@code tax_minor}, {@code price_snapshot.taxes}). The decision
 * below is kept as history. This guard still forbids the class names it lists, so a second,
 * parallel tax engine cannot appear beside {@code StayAdjustmentService}.
 *
 * <p>Original text (2026-08-18):
 * Tax is <strong>outside the KAS V1 business scope</strong> — owner decision, 2026-08-18.
 *
 * <h2>What changed, and why this class was renamed</h2>
 *
 * <p>This was {@code TaxCalculationIsBlockedTest}. That name was accurate while OQ-116 was an
 * unresolved <em>financial</em> question waiting on an accountant: the guard existed to stop a guess
 * reaching a guest's invoice.
 *
 * <p>The owner has now decided something different and stronger. Tax is not a pending decision — it
 * is <strong>not part of V1 at all</strong>. A test called "IsBlocked" would say the project is still
 * waiting for an answer, which is no longer true, and a stale name is exactly the kind of thing that
 * quietly misleads the next reader.
 *
 * <h2>The V1 commercial calculation, as the owner stated it</h2>
 *
 * <pre>
 * Room rate
 *     ↓
 * Voucher eligibility
 *     ↓
 * Voucher discount
 *     ↓
 * Customer payable amount
 * </pre>
 *
 * <p>No tax step. This also retires the contradiction recorded in doc 98 §3.3 — the corpus disagreed
 * on whether tax applied before or after a voucher discount (doc 56 §3 layers versus the doc 53/57/05
 * money-column order). With no tax in V1 the question has no subject.
 *
 * <p>Note that the <em>voucher</em> steps are not implemented either: config B23 is {@code OPEN}
 * (doc 56 §9) and doc 56 §3 puts vouchers at layer 3. V1 pricing today is the room rate alone.
 *
 * <h2>Why the guard survives the decision</h2>
 *
 * <p>The owner's instruction was that the guard may be updated "ONLY as part of recording this
 * explicit owner decision, but <strong>no tax implementation should replace it</strong>." Keeping it
 * is what makes the scope boundary hold: an absent feature is not an excluded one, and nothing else
 * would stop tax arriving in V1 by increments — a column read here, a percentage there.
 *
 * <p>When tax is introduced, doc 99 §12 records that it must be a separate business capability with
 * jurisdiction rules, effective dates, property and global configuration, auditability, booking-time
 * snapshotting and legally validated calculation. Deleting this test is the first step of that work,
 * not a tidy-up along the way.
 */
class TaxIsOutOfScopeForV1Test {

    /**
     * Names that would indicate a tax calculation had been built.
     *
     * <p>The {@code tax_rule} table stays in the schema — it is frozen, V1–V23 are byte-identical,
     * and an unused table costs nothing. Storing or reading a row is harmless. What must not exist is
     * anything that turns one into money.
     */
    private static final List<String> FORBIDDEN_FRAGMENTS =
            List.of("TaxResolver", "TaxCalculator", "TaxService", "TaxEngine", "TaxComputation");

    @Test
    @DisplayName("no tax calculation exists — tax is out of scope for V1")
    void noTaxCalculationExists() {
        List<String> offenders = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.kas.platform")
                .stream()
                .map(JavaClass::getSimpleName)
                .filter(name -> FORBIDDEN_FRAGMENTS.stream().anyMatch(name::contains))
                .sorted()
                .toList();

        assertThat(offenders)
                .as("Tax is outside KAS V1 by owner decision (2026-08-18) — see doc 99 §12. "
                        + "V1 pricing is room rate, then voucher, then customer payable. "
                        + "Tax belongs to the future Commercial / multi-partner phase and must be "
                        + "designed there as a whole capability, not added to V1 piecemeal.")
                .isEmpty();
    }

    @Test
    @DisplayName("no money field on the public availability contract could carry a tax")
    void availabilityContractCarriesNoTax() {
        // Doc 58 §3.2's response is roomTypeSlug, name, availableQuantity,
        // maxQuantitySelectable, nightlyFrom, availableForWholeStay. A tax line
        // appearing here would be the first place tax could reach a guest, so its
        // absence is asserted rather than assumed.
        List<String> fields = java.util.Arrays.stream(
                        com.kas.platform.inventory.api.RoomTypeAvailabilityView.class
                                .getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName)
                .toList();

        assertThat(fields)
                .as("doc 58 §3.2 defines this response exactly")
                .containsExactlyInAnyOrder("roomTypeSlug", "name", "availableQuantity",
                        "maxQuantitySelectable", "nightlyFrom", "availableForWholeStay");
    }
}
