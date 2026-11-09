/**
 * Append-only audit trail.
 *
 * <p>The {@code audit_log} table is protected by triggers that reject UPDATE and
 * DELETE with SQLSTATE {@code 42501} — including for the table owner, because
 * privilege revocation alone does not restrain an owner (doc 88 §5.6,
 * invariants 22 and 23). This module writes; nothing in the platform can amend.
 *
 * <p>Doc 59 §7.6 requires actor, action, target, before/after, timestamp and IP
 * on every privileged action, and §7.7 requires an audit entry for customer data
 * access even when read-only.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Audit",
        allowedDependencies = {"shared"})
package com.kas.platform.audit;
