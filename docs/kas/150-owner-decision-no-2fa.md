# 150 — Owner decision: 2FA is not required in V1

**Date:** 2026-10-20  
**Status:** Approved by the owner in this task  
**Scope:** Staff sign-in policy and the former `SUPER_ADMIN` authentication blocker

## Decision

2FA is **not required for any role in V1**, including `SUPER_ADMIN` and `ADMIN`.
Staff sign in with their email and password through the existing authentication
flow. The `/admin/login` frontend route remains the separate staff-facing screen.

This decision supersedes the former requirement and proposal recorded in docs 06,
10, 59, 90 and 91. The `SUPER_ADMIN` login blocker is removed.

## Controls that remain in force

- Passwords continue to be verified against their stored Argon2id credentials.
- Suspended, disabled, unverified or locked accounts remain unable to sign in.
- Successful sign-in issues the existing short-lived access and rotating refresh
  cookies; tokens remain `HttpOnly` and server-side sessions remain revocable.
- Role permissions and GLOBAL/PARTNER/PROPERTY/OWN scope checks are unchanged.
- CSRF protection and audit logging remain unchanged.
- No 2FA enrolment, challenge, recovery-code, secret-encryption or 2FA management
  interface is part of V1.

The legacy `app_user.two_factor_enabled` database column remains for schema
compatibility and is not used to block sign-in under this policy. No migration is
required.

## Open-question disposition

OQ-089, OQ-089a, OQ-090 and OQ-095–OQ-097 are resolved as not applicable to the
V1 policy. OQ-096's emergency 2FA recovery runbook is likewise unnecessary while
there is no 2FA credential to recover. OQ-091 remains open: the staff API route
contract in doc 58 §8 is a separate contract question and was not changed by this
decision. OQ-092–OQ-094 remain governed by their existing rate-limit, lockout and
session-lifetime decisions.

## Implementation record

`TwoFactorPolicy` no longer blocks `SUPER_ADMIN` authentication. The admin login
screen no longer warns that sign-in is unavailable. Existing session, password,
role, permission and scope controls are retained. No 2FA schema or runtime
dependency was added.
