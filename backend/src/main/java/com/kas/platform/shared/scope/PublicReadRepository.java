package com.kas.platform.shared.scope;

/**
 * Marks a repository whose queries are filtered by <strong>publication
 * state</strong> rather than by an actor's {@link AuthorizationScope}.
 *
 * <p>The public customer surface has no actor. A guest browsing published hotels
 * holds no partner and no property assignment, so demanding a scope there would
 * mean inventing one — and an invented scope is exactly the kind of thing that
 * later turns out to reach further than intended.
 *
 * <p>This is a narrow, explicit exemption from the rule enforced by
 * {@code ScopeEnforcementStructureTest}, not a loophole. An implementation must:
 *
 * <ul>
 *   <li>return <strong>only</strong> rows whose lifecycle state is publicly
 *       visible — doc 03 §8 and doc 52 §3.1;</li>
 *   <li>carry that predicate in the SQL, never in the caller;</li>
 *   <li>expose no field on the doc 58 §9 denylist.</li>
 * </ul>
 *
 * <p>The marker exists so this exemption is one grep away and has to be argued
 * for in review, rather than being achieved by quietly moving a class into a
 * package the architecture test does not inspect.
 */
public interface PublicReadRepository {
}
