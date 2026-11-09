package com.kas.testfixtures.repository;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopedRepository;

import java.util.List;

/**
 * A scoped repository with a query that forgot its scope — the exact mistake
 * that would leak another partner's data.
 *
 * <p>Used to prove {@code ScopeEnforcementRule} detects it.
 */
public class UnscopedRepositoryFixture implements ScopedRepository {

    /** Correct: the scope is a parameter, so it cannot be omitted. */
    public List<String> findAll(AuthorizationScope scope) {
        return List.of();
    }

    /** <strong>The violation.</strong> Callable with no scope at all. */
    public List<String> findEverything() {
        return List.of();
    }
}
