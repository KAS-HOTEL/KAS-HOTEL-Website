# Owner decision — one shared SUPER_ADMIN account, two consoles

**Status:** Approved by the product owner in the KAS project conversation, 24 October 2026.

**Amended 31 October 2026:** the owner asked for two consoles, Admin and Super Admin, that share no function, each the highest authority over its own area. `SUPER_ADMIN` no longer holds the whole catalogue: ADMIN owns hotels, rates, media, reviews and all website content; SUPER_ADMIN owns bookings, customers, vouchers, messages and platform settings. This supersedes the `SUPER_ADMIN` "whole catalogue" column of doc 59 §5. Sections 1 and 2 below, and the trade-off "Everyone holds every permission", no longer describe the target. Each person now signs in to the console of their role. The list of screens per role is in `frontend/src/features/shell/navigation.tsx`, proved against the endpoints by `ConsoleRoleIT`. `SharedAdminAccountProvisioning` also creates ADMIN accounts (`KAS_ADMIN_ROLE=ADMIN`, and `KAS_ADMIN_DATABASE=kas_web_test` for the test database).

An earlier draft of this decision, made the same day, had staff sign in with one shared access key per role. The owner withdrew it before release in favour of the account below; no key sign-in code remains, and the V33 table `staff_access_key` stays unused.

## Decision

1. All KAS staff share **one account** with role **SUPER_ADMIN** over **GLOBAL** scope. It signs in with **email and password** at the ordinary `POST /api/v1/public/auth/login`.
2. The functions stay split across **two consoles**, and one session serves both:
   - `/admin` — platform administration: overview, submissions awaiting review, the property list, website images.
   - `/partner` — hotel operations: properties, room types, rates, inventory, media, policies, booking requests, reservations, messages.

   Each console's navigation links to the other ("Chuyển màn hình").
3. Partner self-registration is withdrawn. `POST /api/v1/public/auth/register` no longer exists and `/partner/register` renders not-found. Accounts are created only by KAS.

## Creating the account and changing its password

Run against the development database `kas_web_dev`, with `KAS_DB_PASSWORD` exported:

```
KAS_ADMIN_EMAIL='…' KAS_ADMIN_PASSWORD='…' ./mvnw test -Dtest=SharedAdminAccountProvisioning -DfailIfNoSpecifiedTests=false
```

The password must be at least 16 characters; only its Argon2id hash is stored. Running the tool again with the same email changes the password, clears any lock and revokes every open session.

## Accepted trade-offs

- **No individual accountability.** The audit log records the shared account, not the person.
- **Everyone holds every permission.** The console split organises the work; it does not restrict it.
- **No individual revocation.** When someone leaves, the password is changed and redistributed.
- **Deliberate lockout is possible.** Anyone who knows the shared email can lock it for 15 minutes at a time (see Lockout). Keep the address private; re-running the provisioning tool lifts a lock.

## Lockout

Approved the same day: **5 consecutive wrong passwords lock the account for 15 minutes**, for every account (customers included), configured as `kas.security.lockout-max-failures` and `kas.security.lockout-duration`. While locked, even the right password is refused and attempts neither count nor extend the lock. A successful sign-in resets the count. The refusal stays the generic 401; the staff sign-in form states the rule instead. A completed customer password reset, or re-running `SharedAdminAccountProvisioning`, lifts the lock. Per-IP rate limiting is not included and belongs at the reverse proxy.

Implementing it exposed that a refused sign-in rolled back its own writes, so the failure count had never been stored; `login` now commits on `InvalidCredentialsException`.

## Not changed

- Customers keep email-and-password sign-in, registration and password reset.
- `PartnerRegistrationService`, `RegistrationRequest`, `RegistrationView` and the frontend `RegisterForm` were removed on 31 October 2026 and remain in Git history. `DevPartnerAccountProvisioning` is superseded.
