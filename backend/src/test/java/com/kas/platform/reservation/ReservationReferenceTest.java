package com.kas.platform.reservation;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The booking reference format — {@code KAS} + branch + five digits.
 *
 * <p>Unit tests, because the draw itself needs no database: uniqueness is the
 * UNIQUE constraint's job and is proven against Postgres in
 * {@code ReservationReferenceIT}.
 */
class ReservationReferenceTest {

    @Test
    @DisplayName("a reference is KAS, the branch code, then five digits — ten characters")
    void shape() {
        String reference = ReservationReference.candidate("05");

        assertThat(reference).hasSize(10);
        assertThat(reference).matches(ReservationReference.FORMAT);
        assertThat(reference).startsWith("KAS05");
    }

    @Test
    @DisplayName("the branch code is carried verbatim, leading zero included")
    void branchCodeIsVerbatim() {
        assertThat(ReservationReference.candidate("01")).startsWith("KAS01");
        assertThat(ReservationReference.candidate("05")).startsWith("KAS05");
        assertThat(ReservationReference.candidate("08")).startsWith("KAS08");
        // Not normalised into "5" anywhere along the way.
        assertThat(ReservationReference.candidate("05")).doesNotStartWith("KAS5");
    }

    @Test
    @DisplayName("exactly five digits are appended, and a leading zero is one of them")
    void suffixIsAlwaysFiveDigits() {
        // Drawn rather than formatted from an int, so a zero-prefixed draw stays
        // five characters instead of collapsing to four.
        boolean sawLeadingZero = false;
        for (int i = 0; i < 3_000; i++) {
            String suffix = ReservationReference.candidate("05").substring(5);
            assertThat(suffix).hasSize(5);
            assertThat(suffix).containsOnlyDigits();
            sawLeadingZero |= suffix.startsWith("0");
        }
        // ~10% of draws; over 3000 the chance of seeing none is vanishing.
        assertThat(sawLeadingZero).isTrue();
    }

    @Test
    @DisplayName("the digits are random, not a sequence")
    void suffixIsRandom() {
        Set<String> seen = new HashSet<>();
        IntStream.range(0, 500)
                .forEach(i -> seen.add(ReservationReference.candidate("05").substring(5)));

        // A counter would produce 500 distinct values in order; randomness is
        // shown by the spread rather than by distinctness alone. 500 draws from
        // 100,000 collide rarely, so a near-full set is the expectation and a
        // tiny set would mean the draw is stuck.
        assertThat(seen).hasSizeGreaterThan(480);
    }

    @Test
    @DisplayName("a property with no branch code is refused, not given a broken reference")
    void missingBranchCodeIsRefused() {
        // V31 leaves branch_code nullable, so a property created after it has
        // none until assigned. "KASnull12345" must never exist.
        for (String invalid : new String[] { null, "", "5", "005", "AB", "0A", " 5" }) {
            assertThatThrownBy(() -> ReservationReference.candidate(invalid))
                    .isInstanceOf(KasException.class)
                    .satisfies(thrown -> assertThat(((KasException) thrown).code())
                            .isEqualTo(ApiErrorCode.CONFIG_MISSING));
        }
    }

    @Test
    @DisplayName("the historical format is not accepted by the new pattern")
    void historicalFormatIsNotTheNewFormat() {
        // Old references stay readable — nothing validates stored values against
        // FORMAT — but they are not what the generator now produces.
        assertThat(ReservationReference.FORMAT.matcher("KAS-260908-CA9W").matches()).isFalse();
        assertThat(ReservationReference.FORMAT.matcher("KAS0512345").matches()).isTrue();
    }
}
