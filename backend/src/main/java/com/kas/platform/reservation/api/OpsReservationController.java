package com.kas.platform.reservation.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.reservation.ReservationSearchService;
import com.kas.platform.reservation.ReservationSearchService.ReservationSearchCriteria;
import com.kas.platform.reservation.StayTransitionService;
import com.kas.platform.security.CurrentActor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * The reservation workspace — doc 58 §6, {@code /admin/ops}:
 * <em>"All channels. Queries use {@code stayStatus}."</em>
 *
 * <h2>The route is the frozen one</h2>
 *
 * Doc 58 §6 already names both endpoints and their permission —
 * {@code GET /ops/reservations} with
 * {@code ?stayStatus,channelType,property,checkIn,checkOut}, and
 * {@code GET /ops/reservations/{reference}}, <em>"full detail, any channel"</em>,
 * both under {@code reservation.view}. Neither was invented for this screen, and
 * no parallel {@code /admin/reservations} family was created beside them.
 *
 * <h2>What is added to the frozen parameter list, and why</h2>
 *
 * <ul>
 *   <li><strong>{@code q}</strong> — the text search. Doc 58 §6 does not name
 *       one, and a reservation workspace without it is a list an operator has to
 *       read rather than a place they can find a booking. It matches the
 *       reference and the guest's name always, and the phone and email only for
 *       a caller holding {@code customer.view}.</li>
 *   <li><strong>Two bounds per date.</strong> §6 writes {@code checkIn} and
 *       {@code checkOut} as single parameters; a workspace needs a range, so each
 *       becomes {@code …From}/{@code …To}. Supplying only one bound is an open
 *       range, so the single-parameter behaviour is still reachable.</li>
 *   <li><strong>{@code bookedFrom}/{@code bookedTo}</strong> — over
 *       {@code created_at}, the one booking timestamp every channel has.</li>
 *   <li><strong>{@code roomType}</strong> — a slug, matched against the
 *       reservation's lines. Room-type slugs are unique per property, so it is
 *       normally paired with {@code property}; alone it means "any room type
 *       with this slug", which is still scope-bounded and still exact.</li>
 *   <li><strong>{@code page}/{@code size}</strong> — see
 *       {@link ReservationPageView} for why this list is the one that needed
 *       them.</li>
 * </ul>
 *
 * <p>Every parameter is optional, and omitting all of them returns the newest
 * page of the caller's reservations.
 *
 * <h2>{@code /admin}, not {@code /partner}</h2>
 *
 * There is no {@code PARTNER} role and no {@code /api/v1/partner} namespace.
 * {@code ADMIN} <em>is</em> the partner-facing role — doc 85 §5.2 gives it
 * PARTNER scope, and OQ-129 (resolved, doc 100 §14.1) approved a separate
 * {@code /partner/**} <strong>frontend</strong> IA while stating that it creates
 * "no {@code PARTNER} role, permission, authentication model or API namespace".
 *
 * <h2>Authorization</h2>
 *
 * {@code reservation.view}, the permission doc 58 §6 names for both routes.
 * Scope is applied inside the repository's SQL against
 * {@code reservation → property → partner} — on the list, on the count behind
 * the page metadata, and on every read the detail makes. Another partner's
 * reservation is <strong>absent</strong>: it cannot be listed, cannot be found
 * by any filter or search term, is not counted in {@code total}, and answers 404
 * on direct access — never 403, which would confirm the reference exists (doc 85
 * §6.3).
 *
 * <h2>Reads only</h2>
 *
 * Search and detail are reads. The three frozen operational actions below use
 * scoped, transactional transitions; they never modify room inventory.
 */
@RestController
@RequestMapping("/api/v1/admin/ops/reservations")
public class OpsReservationController {

    /** Matches every other public-facing surface in this application. */
    private static final String DEFAULT_LOCALE = "en";

    private final ReservationSearchService reservations;
    private final StayTransitionService stayTransitions;
    private final com.kas.platform.reservation.CheckoutRequestService checkouts;

    public OpsReservationController(ReservationSearchService reservations,
                                    StayTransitionService stayTransitions,
                                    com.kas.platform.reservation.CheckoutRequestService checkouts) {
        this.reservations = reservations;
        this.stayTransitions = stayTransitions;
        this.checkouts = checkouts;
    }

    /**
     * Checked-in stays whose guest asked to check out (or whose check-out time passed, V59),
     * waiting for SUPER_ADMIN to confirm. Confirming is the ordinary check-out below.
     */
    @GetMapping("/checkout-requests")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CHECKIN + "')")
    public java.util.List<com.kas.platform.reservation.CheckoutRequestService.Pending> checkoutRequests(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return checkouts.pending(CurrentActor.require().actor().scope(), locale);
    }

    /**
     * Search — doc 58 §6's {@code GET /ops/reservations}.
     *
     * <p>Newest first, by {@code created_at} then {@code reference}. That pair is
     * a total order, which is what makes an offset page stable; the sales queue's
     * oldest-first ordering is deliberately <em>not</em> reused, because this is
     * a lookup rather than a worklist.
     *
     * <p>An unknown {@code stayStatus} or {@code channelType} is a
     * <strong>400</strong> naming the parameter. An unknown {@code property} or
     * {@code roomType} slug is an empty page: refusing it would tell the caller
     * which slugs are real.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_VIEW + "')")
    public ReservationPageView search(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String stayStatus,
            @RequestParam(required = false) String channelType,
            @RequestParam(required = false) String property,
            @RequestParam(required = false) String roomType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate checkInFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate checkInTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate checkOutFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate checkOutTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate bookedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate bookedTo,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {

        return reservations.search(
                new ReservationSearchCriteria(q, stayStatus, channelType, property, roomType,
                        checkInFrom, checkInTo, checkOutFrom, checkOutTo, bookedFrom, bookedTo,
                        page, size),
                CurrentActor.require().actor(), locale);
    }

    /**
     * One reservation — doc 58 §6, <em>"full detail, any channel"</em>.
     *
     * <p>Guest contact detail is included only when the caller also holds
     * {@code customer.view}, and the read is logged when it is — doc 59:148.
     *
     * <p>404 for a reference that does not exist or belongs to another partner.
     * Unlike the sales detail, an OTA reservation is <strong>not</strong> a 404
     * here: this route is the one doc 58 §6 defines for every channel.
     */
    @GetMapping("/{reference}")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_VIEW + "')")
    public ReservationDetailView detail(
            @PathVariable String reference,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return reservations.detail(reference, CurrentActor.require().actor(), locale);
    }

    @PostMapping("/{reference}/check-in")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CHECKIN + "')")
    public StayTransitionView checkIn(@PathVariable String reference) {
        return stayTransitions.transition(reference, StayTransitionService.Action.CHECK_IN,
                CurrentActor.require().actor());
    }

    @PostMapping("/{reference}/check-out")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CHECKIN + "')")
    public StayTransitionView checkOut(@PathVariable String reference) {
        return stayTransitions.transition(reference, StayTransitionService.Action.CHECK_OUT,
                CurrentActor.require().actor());
    }

    @PostMapping("/{reference}/no-show")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CHECKIN + "')")
    public StayTransitionView noShow(@PathVariable String reference) {
        return stayTransitions.transition(reference, StayTransitionService.Action.NO_SHOW,
                CurrentActor.require().actor());
    }

    /**
     * Undoes a check-out confirmed by mistake (back to CHECKED_IN). The booking stops counting
     * towards the membership tier review and the member's tier drops at once if the quarter
     * falls below its threshold (owner decision 2026-11-09).
     */
    @PostMapping("/{reference}/undo-check-out")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CHECKIN + "')")
    public StayTransitionView undoCheckOut(@PathVariable String reference) {
        return stayTransitions.transition(reference, StayTransitionService.Action.UNDO_CHECK_OUT,
                CurrentActor.require().actor());
    }
}
