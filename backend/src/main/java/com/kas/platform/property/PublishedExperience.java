package com.kas.platform.property;

/**
 * A signature experience as a guest sees it — doc 67 §1's section 5,
 * <em>"SIGNATURE EXPERIENCES — named, unique to this property"</em>, and doc 66
 * §7's <em>"where Milestone's restaurant and rooftop live as</em> experiences
 * <em>rather than amenity checkboxes"</em>.
 *
 * <p>No id and no {@code sortOrder}: nothing on the public surface addresses an
 * experience, and the order of the list <em>is</em> the order — echoing the
 * number would invite a client to re-sort by it and disagree with the operator.
 * The same shape, and the same reason, as {@link PublishedLandmark}.
 *
 * <p>{@code description} is nullable because the column is. A title always
 * exists; an experience with only a name is a real thing a Partner may publish,
 * and rendering it is the guest surface's problem, not a reason to refuse it.
 */
public record PublishedExperience(String title, String description) {
}
