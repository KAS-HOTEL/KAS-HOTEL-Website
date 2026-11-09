package com.kas.platform.shared.scope;

/**
 * Marks a repository over partner- or property-owned data whose <em>every</em>
 * query is restricted by an {@link AuthorizationScope}.
 *
 * <p>This is the structural half of doc 59 §7.3 ("property scope is applied in
 * the data layer, at the repository boundary"). The behavioural half is
 * {@link ScopeFilter}. The marker exists so the rule can be enforced by a test
 * rather than by review:
 *
 * <ul>
 *   <li>every {@code @Repository} over partner-owned data implements this
 *       interface, and</li>
 *   <li>every public method on an implementation declares an
 *       {@code AuthorizationScope} parameter.</li>
 * </ul>
 *
 * <p>Both are asserted by {@code ScopeEnforcementStructureTest}. Together they
 * make "someone forgot to pass the scope" a compile-and-test failure instead of
 * a cross-partner data leak.
 */
public interface ScopedRepository {
}
