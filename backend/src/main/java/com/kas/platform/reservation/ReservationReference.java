package com.kas.platform.reservation;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;

import java.security.SecureRandom;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The booking reference a guest reads back over the phone.
 *
 * <h2>{@code KAS} + two-digit branch + five random digits</h2>
 *
 * <pre>{@code KAS0512345}</pre>
 *
 * Ten characters, matching {@link #FORMAT}. The branch code says which hotel
 * without anyone having to look it up; the five digits make the reference
 * non-enumerable, which is the property doc 08 §7 actually asks for — knowing
 * one booking's reference must not let you guess the next one's.
 *
 * <h2>Why the digits are drawn, not counted</h2>
 *
 * A sequence would make every reference a guess away from its neighbour, and
 * would leak how many bookings a branch has taken. {@link SecureRandom} is used
 * rather than {@code Math.random} or {@code ThreadLocalRandom} for the same
 * reason the alphabet was chosen before it: this is an identifier handed to the
 * public, not a shuffle.
 *
 * <h2>Leading zeroes are values, not formatting</h2>
 *
 * {@code 00042} is a legal suffix and is stored verbatim. The digits are drawn
 * as five independent digits rather than as an {@code int} formatted to width,
 * so there is no path where a zero-prefixed draw silently becomes four
 * characters.
 *
 * <h2>Uniqueness is the database's job</h2>
 *
 * This class draws candidates. It cannot promise one is unused, and does not
 * try: {@code reservation.reference} has carried
 * {@code CONSTRAINT reservation_reference_key UNIQUE (reference)} since V12,
 * table-wide and therefore global across every property and every partner. The
 * caller inserts and retries on the constraint — see
 * {@code ReservationRequestService}.
 *
 * <p>The space is 100,000 per branch. That is small enough to collide
 * eventually, which is exactly why the retry exists and why the constraint,
 * not a pre-check, is the guarantee.
 */
public final class ReservationReference {

    /** The shape every new reference matches. Ten characters, digits only after the prefix. */
    public static final Pattern FORMAT = Pattern.compile("^KAS[0-9]{7}$");

    private static final Pattern BRANCH_CODE = Pattern.compile("^[0-9]{2}$");
    private static final String PREFIX = "KAS";
    private static final int SUFFIX_DIGITS = 5;

    /**
     * Shared and thread-safe. {@link SecureRandom} synchronises internally, and
     * a reservation insert is nowhere near hot enough for that to matter.
     */
    private static final SecureRandom RANDOM = new SecureRandom();

    private ReservationReference() {
    }

    /**
     * A candidate reference for one branch.
     *
     * @param branchCode the property's two-digit code, exactly as stored
     * @throws KasException {@code CONFIG_MISSING} when the property has no code
     *                      — a booking must not be given a reference that cannot
     *                      identify its hotel
     */
    public static String candidate(String branchCode) {
        requireBranchCode(branchCode);

        StringBuilder reference = new StringBuilder(PREFIX.length() + 2 + SUFFIX_DIGITS);
        reference.append(PREFIX).append(branchCode);
        for (int i = 0; i < SUFFIX_DIGITS; i++) {
            reference.append((char) ('0' + RANDOM.nextInt(10)));
        }
        return reference.toString();
    }

    /**
     * Refuses a property that has no branch code, in the caller's terms.
     *
     * <p>V31 made the column nullable on purpose: a property created after it
     * has no code until somebody assigns one. Failing here is the point — the
     * alternatives are a reference reading {@code KASnull12345} or a code
     * invented on the spot, and both would attach a booking to a hotel it
     * cannot name.
     */
    private static void requireBranchCode(String branchCode) {
        if (branchCode != null && BRANCH_CODE.matcher(branchCode).matches()) {
            return;
        }
        throw new KasException(ApiErrorCode.CONFIG_MISSING,
                "This property has no branch code, so a booking reference cannot be issued.",
                List.of(new KasException.ErrorDetail("branchCode", "REQUIRED",
                        "Assign the property a two-digit branch code before taking bookings.")));
    }
}
