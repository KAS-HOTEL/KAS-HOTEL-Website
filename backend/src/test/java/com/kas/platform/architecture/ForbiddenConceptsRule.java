package com.kas.platform.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The entities and field names the frozen architecture prohibits.
 *
 * <p>Doc 52 §6 lists entities that were evaluated and deliberately excluded, and
 * doc 52 §4 R13 requires that no generic {@code status} column or field exists.
 * These are not stylistic preferences — each one, if introduced, would undo a
 * decision that the rest of the architecture depends on:
 *
 * <ul>
 *   <li>{@code PhysicalRoom} — "room numbers cannot leak if they do not exist"</li>
 *   <li>{@code DirectReservation} / {@code OTAReservation} — splitting the
 *       reservation entity creates two writers to availability</li>
 *   <li>a generic {@code status} — collapses {@code salesStatus} and
 *       {@code stayStatus}, the distinction the whole model is built on</li>
 *   <li>{@code source} on a reservation — merges distribution channel, lead
 *       source and sales owner, the correction that produced doc 29</li>
 * </ul>
 */
final class ForbiddenConceptsRule {

    /** Doc 52 §6, plus the two prohibited reservation splits. */
    private static final Set<String> PROHIBITED_TYPE_NAMES = Set.of(
            "physicalroom", "directreservation", "otareservation", "otaguest",
            "rateplan", "cart", "basket", "lead", "salesowner");

    /** Doc 58 §9 PHYSICAL group. No field may be able to hold a room identity. */
    private static final Set<String> PHYSICAL_FIELD_NAMES = Set.of(
            "roomnumber", "floor", "unitid", "buildingsection", "assignedroom");

    /** Types where a bare {@code status} or {@code source} would be the prohibited merge. */
    private static final Set<String> TWO_LIFECYCLE_TYPES = Set.of("reservation", "booking", "stay");

    private ForbiddenConceptsRule() {
    }

    static List<String> prohibitedTypes(JavaClasses classes) {
        return classes.stream()
                .filter(type -> PROHIBITED_TYPE_NAMES.contains(normalise(type.getSimpleName())))
                .map(type -> type.getName() + " — prohibited entity (doc 52 §6)")
                .sorted()
                .toList();
    }

    static List<String> physicalRoomFields(JavaClasses classes) {
        return classes.stream()
                .flatMap(type -> type.getFields().stream())
                .filter(field -> PHYSICAL_FIELD_NAMES.contains(normalise(field.getName())))
                .map(field -> field.getFullName() + " — physical room identity (doc 58 §9)")
                .sorted()
                .toList();
    }

    /**
     * A bare {@code status} or {@code source} on a reservation-shaped type.
     *
     * <p>{@code salesStatus} and {@code stayStatus} are correct and must not be
     * flagged; the violation is specifically the <em>generic</em> name that
     * collapses them.
     */
    static List<String> collapsedLifecycleFields(JavaClasses classes) {
        return classes.stream()
                .filter(type -> mentionsReservation(type.getSimpleName()))
                .flatMap(type -> type.getFields().stream())
                .filter(field -> {
                    String name = normalise(field.getName());
                    return name.equals("status") || name.equals("source");
                })
                .map(field -> field.getFullName()
                        + " — generic status/source on a reservation type (doc 52 §4 R13, doc 29)")
                .sorted()
                .toList();
    }

    private static boolean mentionsReservation(String simpleName) {
        String normalised = normalise(simpleName);
        return TWO_LIFECYCLE_TYPES.stream().anyMatch(normalised::contains);
    }

    private static String normalise(String name) {
        return name.toLowerCase(Locale.ROOT).replace("_", "");
    }
}
