/**
 * Central Inventory — the single availability engine.
 *
 * <p>Doc 55 §1: "Central Inventory is the <strong>single availability engine</strong>
 * for every channel. Direct reservations, OTA reservations, holds, maintenance and
 * operational blocks all resolve against it."
 *
 * <h2>What is load-bearing here</h2>
 *
 * <p>The no-oversell guarantee is a <strong>database CHECK constraint</strong>
 * ({@code inv_no_oversell} on {@code room_type_inventory_day}), not a rule in this
 * package. Doc 15 §2.2 states the reason plainly: "Application logic can have bugs.
 * A CHECK constraint cannot be bypassed by a bug in a service, a missing validation,
 * a race condition, or a direct admin action."
 *
 * <p>Everything in this package is therefore an <em>optimisation for user
 * experience</em> layered over that guarantee — never the guarantee itself. No
 * Java code here decides whether an allocation is safe; it writes the row and lets
 * PostgreSQL refuse.
 *
 * <h2>Cache versus authority — doc 55 §3.4</h2>
 *
 * <p>{@code direct_committed}, {@code ota_committed} and {@code buffer_target} on
 * the daily row are a <strong>cache</strong>. The authority is the doc 55 §3.1
 * expression evaluated over reservation lines and holds. The cache carries the
 * CHECK, so an oversell cannot be written; an allocation re-derives under lock and
 * never trusts it.
 *
 * <h2>Deliberate absences</h2>
 *
 * <ul>
 *   <li>No {@code occupied} counter. Doc 55 §3.3: check-in is a relabel, not a new
 *       consumption. Occupancy derives from {@code stay_status}.</li>
 *   <li>No {@code ota_allotment}. Doc 55 §3.2 withdrew it; the buffer blocks only
 *       its unused portion.</li>
 *   <li>No physical room, room number or room instance — doc 52 forbids them, and
 *       {@code ForbiddenConceptsTest} enforces it.</li>
 *   <li>No reservation creation, no checkout, no payment. Those are later phases;
 *       this module supplies the availability and allocation primitives they need.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Central Inventory",
        allowedDependencies = {"shared", "partner", "property", "pricing", "identity", "audit",
                "security", "settings", "web"})
package com.kas.platform.inventory;
