package com.kas.platform.inventory;

import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.KasException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * OTA safety buffer resolution.
 *
 * <h2>Owner decision, 2026-08-18 — OQ-115</h2>
 *
 * <p>Buffer resolution uses <strong>the same semantics as the frozen rate resolver</strong>
 * (doc 56 §3.1), rather than a separate model invented for buffers:
 *
 * <ol>
 *   <li>{@code priority DESC}</li>
 *   <li>{@code specificity DESC}</li>
 *   <li>a remaining tie is a <strong>configuration error</strong>, not an arbitrary selection</li>
 * </ol>
 *
 * <p>The frozen material supplied the phrase — doc 13 §3.4c ¶1, "Rules resolve by {@code priority},
 * most specific first" — and doc 56 §3.1 is the only place the corpus defines what that phrase means.
 * The owner confirmed the two carry one meaning.
 *
 * <h2>What was already frozen, and is applied here unchanged</h2>
 *
 * <ul>
 *   <li><strong>No matching rule ⇒ buffer 0.</strong> Doc 13 §3.4c: "with no rule configured,
 *       {@code ota_allotment = 0}". Zero is the specified answer, not a default chosen here.</li>
 *   <li><strong>{@code PERCENTAGE} is of {@code total} and rounds up.</strong> Doc 13 §3.4c ¶3 —
 *       "under-buffering is the costlier error".</li>
 *   <li><strong>Clamped so it can never drive availability negative.</strong> Doc 13 §3.4c ¶4 and
 *       doc 55 §6.2. Without the clamp, raising a buffer on a busy date would violate
 *       {@code inv_no_oversell} and block the write; clamping degrades safely.</li>
 * </ul>
 *
 * <h2>What is deliberately absent</h2>
 *
 * <p>No buffer <em>value</em> appears anywhere in this class or its tests as a KAS figure. Buffer
 * values are config <strong>B3</strong>, status {@code BLOCKED} (doc 51 §3), and sizing needs the
 * channel volume data still open under OQ-033.
 */
public final class BufferResolver {

    /** Doc 56 §3.1, applied to buffers by owner decision — {@code priority DESC, specificity DESC}. */
    private static final Comparator<OtaSafetyBufferRule> MOST_SPECIFIC_FIRST =
            Comparator.comparingInt(OtaSafetyBufferRule::priority)
                    .thenComparingInt(OtaSafetyBufferRule::specificity)
                    .reversed();

    private BufferResolver() {
    }

    /**
     * The buffer to materialise onto one inventory day.
     *
     * <p>Pure: it takes the candidates and the day, and returns a number. Nothing here reads the
     * database, so the ordering rule is testable without one and cannot differ between the
     * materialisation path and a preview.
     *
     * @param candidates ACTIVE rules already filtered to this room type, date and the V1
     *                   channel-agnostic scope
     * @return the clamped buffer, never negative and never above the day's headroom
     * @throws BusinessRuleException two rules tie on {@code (priority, specificity)}
     */
    public static int resolve(List<OtaSafetyBufferRule> candidates, InventoryDay day) {
        if (candidates.isEmpty()) {
            return 0;
        }

        List<OtaSafetyBufferRule> ranked = new ArrayList<>(candidates);
        ranked.sort(MOST_SPECIFIC_FIRST);

        OtaSafetyBufferRule winner = ranked.get(0);
        requireNoTie(ranked, winner, day.date());

        return clamp(winner.configuredFor(day.total()), day);
    }

    /**
     * Doc 13 §3.4c ¶4 / doc 55 §6.2:
     *
     * <pre>effectiveBuffer = MIN(configuredBuffer, total − Blocked − DirectCommitted − OtaCommitted)</pre>
     *
     * <p>The lower bound of zero is this method's own: a headroom that has already gone negative —
     * which the CHECK makes unwritable, but which a stale read could still present — must not turn
     * into a negative buffer that <em>adds</em> availability.
     */
    private static int clamp(int configured, InventoryDay day) {
        int headroom = day.total() - day.committedAndBlocked();
        return Math.max(Math.min(configured, headroom), 0);
    }

    /**
     * Doc 56 §3.1: "Ties on {@code (priority, specificity)} are a <strong>configuration error</strong>,
     * not a coin flip."
     *
     * <p>Applied to buffers by the same owner decision. A resolver that silently took the first row
     * would make how many rooms are withheld from direct sale depend on PostgreSQL's row order.
     */
    private static void requireNoTie(List<OtaSafetyBufferRule> ranked, OtaSafetyBufferRule winner,
                                     LocalDate date) {
        if (ranked.size() < 2) {
            return;
        }
        OtaSafetyBufferRule runnerUp = ranked.get(1);
        if (runnerUp.priority() != winner.priority()
                || runnerUp.specificity() != winner.specificity()) {
            return;
        }
        throw new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "Two OTA buffer rules are equally applicable, so no buffer can be determined.",
                List.of(new KasException.ErrorDetail(date.toString(), "BUFFER_RULE_TIE",
                        "Two rules share priority " + winner.priority()
                                + " and the same specificity. Change one before this date is sold.")));
    }
}
