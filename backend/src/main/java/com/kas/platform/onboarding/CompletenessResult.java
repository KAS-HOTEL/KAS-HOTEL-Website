package com.kas.platform.onboarding;

import java.util.List;

/**
 * Which onboarding sections are finished, and what each one is still missing.
 *
 * <p>Shaped for the progress display the phase brief §18.2 describes, and for
 * the {@code details[]} array of a {@code 422} when a submit is refused — the
 * same information serves both, so a Partner never sees a different list from
 * the one that blocked them.
 */
public record CompletenessResult(List<Section> sections) {

    public CompletenessResult {
        sections = List.copyOf(sections);
    }

    /** One onboarding step. {@code missing} names fields, never values. */
    public record Section(String name, boolean complete, List<String> missing) {

        public Section {
            missing = List.copyOf(missing);
        }

        static Section of(String name, List<String> missing) {
            return new Section(name, missing.isEmpty(), missing);
        }
    }

    public boolean isComplete() {
        return sections.stream().allMatch(Section::complete);
    }

    /** Every missing field across all sections, for the error detail list. */
    public List<String> allMissing() {
        return sections.stream().flatMap(s -> s.missing().stream()).toList();
    }
}
