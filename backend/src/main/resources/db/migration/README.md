# KAS Database Migrations

**Status:** Directory structure only. **No migration files have been authored or applied.**
**Blocked on:** `POSTGRES_CREDENTIALS_REQUIRED` — see
[docs/kas/88-phase-7-2-database-foundation.md](../../../../../../docs/kas/88-phase-7-2-database-foundation.md)

---

## Location

This is the **Flyway default classpath location** for a Spring Boot application:

```
backend/src/main/resources/db/migration/
```

Spring Boot discovers migrations here automatically with no configuration. It is used in preference to
the `db/migrations/` layout sketched in [86 §9](../../../../../../docs/kas/86-phase-7-1-environment-bootstrap.md),
because Phase 7.2 Step 7 specifies this path and it avoids a custom `spring.flyway.locations` setting
in Phase 7.3.

**Only this directory exists.** No Spring Boot application, no `pom.xml`, no Java source — those belong
to Phase 7.3.

---

## Naming convention

```
V<version>__<snake_case_description>.sql        versioned, applied once, in order
R__<snake_case_description>.sql                 repeatable, re-applied when checksum changes
```

Examples:

```
V1__extensions_and_enums.sql
V2__partner.sql
V10__room_type_inventory_day.sql
R__reference_distribution_channels.sql
```

**Two underscores** separate version from description. Flyway requires this.

---

## Rules

| # | Rule |
|---|---|
| 1 | **Never edit an applied migration.** Flyway validates checksums; an edit breaks every environment that already ran it. Fix forward with a new version |
| 2 | **Forward-only.** No `undo` migrations in V1 |
| 3 | **Deterministic.** No `now()`, no random values, no environment-dependent behaviour in DDL |
| 4 | **Environment-independent.** No hard-coded database or role names beyond `kas_app` |
| 5 | **Constraints belong with their table**, in the same migration — not deferred to a later "constraints" migration |
| 6 | **Indexes belong with their table**, same migration |
| 7 | **One logical concern per file.** A migration that creates six unrelated tables is unreviewable |
| 8 | **No business data.** Reference data (distribution channels) is technical; hotel names, rates and addresses are not |
| 9 | **No secrets.** No passwords, no keys, no connection strings |
| 10 | Every file opens with a comment naming the authoritative source document and section |

---

## Authoritative sources

| Concern | Document |
|---|---|
| Table structure, constraints, indexes, locking | [53 — Database / ERD](../../../../../../docs/kas/53-phase-4-database-erd.md) |
| Entity semantics, invariants, visibility | [52 — Domain Model](../../../../../../docs/kas/52-phase-4-domain-model.md) |
| Status enums and transitions | [54 — State Machines](../../../../../../docs/kas/54-phase-4-state-machines.md) |
| Inventory constraints and the oversell guarantee | [55 — Central Inventory](../../../../../../docs/kas/55-phase-4-inventory.md) |
| Rate model and the V1-null hooks | [56 — Pricing](../../../../../../docs/kas/56-phase-4-pricing.md) |
| Reservation and sales inquiry | [57 — Reservation & Sales Inquiry](../../../../../../docs/kas/57-phase-4-reservation-sales.md) |
| RBAC scopes | [59 — RBAC](../../../../../../docs/kas/59-phase-4-rbac.md) |
| Customer and review | [61 — Customer & Review](../../../../../../docs/kas/61-phase-4-customer-review.md) |
| Media | [62 — Media](../../../../../../docs/kas/62-phase-4-media.md) |
| **Partner model** | [85 — Partner / Property Amendment](../../../../../../docs/kas/85-partner-property-model-amendment.md) |
| Invariants requiring executable tests | [63 — Validation](../../../../../../docs/kas/63-phase-4-validation.md) |

**Document 53 is authoritative on structure.** Where any other source disagrees, 53 governs.
