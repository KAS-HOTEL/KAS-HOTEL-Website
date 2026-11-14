package com.kas.platform.reservation.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.reservation.BookingNotificationService;
import com.kas.platform.reservation.SalesRequestRepository;
import com.kas.platform.reservation.SalesRequestService;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.EmailOutboxRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The direct sales queue — doc 58 §5, {@code /admin/sales}.
 *
 * <h2>Why {@code /admin} and not {@code /partner}</h2>
 *
 * There is no {@code PARTNER} role and no {@code /api/v1/partner} namespace.
 * {@code ADMIN} <em>is</em> the partner-facing role — doc 85 §5.2 gives it
 * PARTNER scope, and OQ-129 (resolved, doc 100 §14.1) approved a separate
 * {@code /partner/**} <strong>frontend</strong> IA while stating that it creates
 * "no {@code PARTNER} role, permission, authentication model or API namespace:
 * the backend stays {@code ADMIN} role + {@code PARTNER} scope". Inventing one
 * here would contradict a decision the owner already made.
 *
 * <h2>Authorization</h2>
 *
 * {@code sales.request.view}, the permission doc 58 §5 names for both routes.
 * Scope is applied inside the repository's SQL against
 * {@code reservation → property → partner}, so another partner's request is
 * <strong>absent</strong> and answers 404 — never 403, which would confirm the
 * reference exists (doc 85 §6.3). A reference is an identifier, never a
 * credential.
 *
 * <h2>Reads only</h2>
 *
 * Both methods are {@code GET}. Nothing here creates, releases or inspects a hold
 * for mutation, moves {@code direct_committed}, or touches availability. CSRF is
 * irrelevant to a GET and the application's posture is unchanged.
 */
@RestController
@RequestMapping("/api/v1/admin/sales/requests")
public class AdminSalesRequestController {

    /** Matches every other public-facing surface in this application. */
    private static final String DEFAULT_LOCALE = "en";

    private final SalesRequestService requests;
    private final BookingNotificationService notifications;
    private final EmailOutboxRepository emailOutbox;

    public AdminSalesRequestController(SalesRequestService requests,
                                       BookingNotificationService notifications,
                                       EmailOutboxRepository emailOutbox) {
        this.requests = requests;
        this.notifications = notifications;
        this.emailOutbox = emailOutbox;
    }

    /**
     * The queue — doc 58 §5, {@code ?salesStatus,leadSource,owner,slaState,property}.
     *
     * <p>Three of those five are implemented, because three have frozen
     * semantics: {@code salesStatus} and {@code leadSource} are database enums,
     * and {@code property} is a slug already present in the response.
     *
     * <p>{@code slaState} accepts only {@code breached} — doc 69 §127 names three
     * bands but freezes no threshold between the other two. {@code owner} is
     * absent entirely: doc 134 established that nothing in this repository yields
     * an assignable owner's identity, so the filter would need either a picker
     * that cannot be built or a raw user id in a URL.
     *
     * <p>Ordering is unchanged and unfilterable: oldest unactioned first, which
     * doc 69 §4.2 freezes with its reason — "a request model fails by neglect,
     * not by backlog order." No sort or page parameter is accepted; this project
     * still has no pagination convention to copy, and OQ-158 records the same gap
     * on the admin property list.
     *
     * <p>Every parameter is optional, and omitting all of them returns exactly
     * what this route returned before.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_VIEW + "')")
    public List<SalesRequestSummaryView> queue(
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale,
            @RequestParam(required = false) String salesStatus,
            @RequestParam(required = false) String leadSource,
            @RequestParam(required = false) String slaState,
            @RequestParam(required = false) String property,
            @RequestParam(required = false) String queue,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort) {
        return requests.queue(CurrentActor.requireScope(), locale,
                SalesRequestService.filter(salesStatus, leadSource, slaState, property, queue, q, sort), page, size);
    }

    /**
     * Request counts for the queue's views — all, awaiting, expired, accepted —
     * counted in the database for the caller's scope and the optional hotel slug,
     * so the tab numbers never depend on what one page of the list shows.
     */
    @GetMapping("/counts")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_VIEW + "')")
    public SalesRequestRepository.QueueCounts counts(@RequestParam(required = false) String property,
                                                     @RequestParam(required = false) String q) {
        return requests.queueCounts(CurrentActor.requireScope(), property, q);
    }

    /**
     * One request — doc 58 §5 <em>"Full workspace"</em>.
     *
     * <p>Guest contact detail is included only when the caller also holds
     * {@code customer.view}, and the read is logged when it is — doc 59:148.
     *
     * <p>404 for a reference that does not exist, belongs to another partner, or
     * is an OTA reservation: doc 58 §5 scopes this API to {@code DIRECT} at the
     * data layer, so an OTA record is not addressable here at all.
     */
    @GetMapping("/{reference}")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_VIEW + "')")
    public SalesRequestDetailView detail(
            @PathVariable String reference,
            @RequestParam(defaultValue = DEFAULT_LOCALE) String locale) {
        return requests.detail(reference, CurrentActor.require().actor(), locale);
    }

    /** Delivery state is separate from the booking decision and scoped to the caller's property. */
    @GetMapping("/{reference}/email-deliveries")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_VIEW + "')")
    public List<EmailOutboxRepository.EmailDeliveryStatus> emailDeliveries(@PathVariable String reference) {
        requests.detail(reference, CurrentActor.require().actor(), DEFAULT_LOCALE);
        return emailOutbox.statusForReservation(reference);
    }

    /**
     * S11 — decline a direct request. Doc 58 §5, permission
     * {@code reservation.cancel}, <em>"Reason required"</em>.
     *
     * <h3>What this does and does not do</h3>
     *
     * Moves {@code salesStatus} to {@code DECLINED}, releases every ACTIVE hold,
     * removes them from {@code direct_committed}, and writes the status history
     * and the {@code reservation.declined} audit event — all in one transaction.
     *
     * <p>After the transition commits, the guest is emailed (Brevo template
     * {@code BOOKING_REQUEST_REJECTED}) with the reason typed here, so the console
     * tells the agent that the reason is guest-facing.
     *
     * <h3>Failures</h3>
     *
     * <strong>400</strong> for a missing or blank reason · <strong>404</strong> for
     * a reference that is absent, another partner's, or an OTA reservation — one
     * answer (doc 85 §6.3) · <strong>409 {@code ILLEGAL_TRANSITION}</strong> for a
     * reservation already in a terminal state, which is what a second decline is.
     *
     * <p>204, not 200: doc 54 defines the transition's effects on the record, not
     * a response document, and inventing one would freeze a shape the contract has
     * not. The caller re-reads the detail to see the new state.
     */
    @PostMapping("/{reference}/decline")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CANCEL + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@PathVariable String reference,
                        @Valid @RequestBody DeclineRequestBody body) {
        requests.decline(reference, body.reason().trim(), CurrentActor.require().actor());
        notifications.bookingRequestRejected(reference, body.reason().trim());
    }

    /**
     * S12 — doc 58 §5, the same row as {@code /decline}:
     * {@code reservation.cancel}, <em>"Reason required"</em>.
     *
     * <p>Doc 54 S12's actor column is <strong>C / S</strong>. This is the sales
     * half. The customer half is handled by the separate
     * {@code POST /me/stays/{reference}/cancel} route; this endpoint remains
     * restricted to actors with the reservation-cancel permission.
     */
    @PostMapping("/{reference}/cancel")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_CANCEL + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @org.springframework.transaction.annotation.Transactional
    public void cancel(@PathVariable String reference,
                       @Valid @RequestBody CancelRequestBody body) {
        requests.cancel(reference, body.reason().trim(), body.requestedBy(),
                Boolean.TRUE.equals(body.paymentChecked()), CurrentActor.require().actor());
        notifications.bookingCancelled(reference);
    }

    /**
     * S2 — doc 58 §5, {@code sales.request.assign} (owner decision 4).
     *
     * <p>The permission is checked here <strong>and</strong> the scope is applied
     * in every statement the service runs. The frontend is never the boundary:
     * hiding a button changes nothing about what this endpoint accepts.
     */
    @PostMapping("/{reference}/assign")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_ASSIGN + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assign(@PathVariable String reference,
                       @Valid @RequestBody AssignRequestBody body) {
        requests.assign(reference, body.salesOwnerId(), trimmed(body.reason()),
                CurrentActor.require().actor());
    }

    /**
     * S3 / S4 — doc 58 §5, <em>"Live re-check"</em>, {@code sales.request.manage}.
     *
     * <p>The permission is the frozen one for this route. Doc 54 makes S4's
     * self-assignment a <em>side effect</em> of the check rather than a separate
     * authorization, so requiring {@code sales.request.assign} as well would be
     * adding a guard the contract does not have.
     *
     * <p>No body: the reservation already carries every parameter the check needs
     * — its property, dates and lines. Accepting any of them from the caller
     * would let the caller choose what gets checked.
     */
    @PostMapping("/{reference}/availability-check")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void availabilityCheck(@PathVariable String reference) {
        requests.availabilityCheck(reference, CurrentActor.require().actor());
    }

    /**
     * The internal notes — doc 58 §5, {@code sales.request.manage},
     * <em>"Internal. No guest surface exists"</em>.
     *
     * <p>Newest first, the order V14's own index was built for. No author is
     * returned: the note records one, and disclosing staff identity between
     * colleagues is unresolved (doc 134 §5).
     */
    @GetMapping("/{reference}/notes")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    public List<SalesRequestNoteView> notes(@PathVariable String reference) {
        return requests.notes(reference, CurrentActor.requireScope());
    }

    /**
     * Appends one internal note — doc 58 §5, the same row and permission.
     *
     * <p>204, like every other mutation on this controller: doc 58 states no
     * response for it, and the caller re-reads the list. The author and timestamp
     * are the server's, never the caller's.
     */
    @PostMapping("/{reference}/notes")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addNote(@PathVariable String reference,
                        @Valid @RequestBody NoteRequestBody body) {
        requests.addNote(reference, body.body().trim(), CurrentActor.require().actor());
    }

    /**
     * S5 / S6 — doc 58 §5, {@code sales.request.manage}, <em>"Log a contact"</em>.
     *
     * <p>One route for both, because doc 54 gives them the same destination and
     * the same side effect; the source state is what separates them, and the
     * server holds it. {@code ALTERNATIVE_OFFERED} — S9 — is refused: it releases
     * alternative holds, and that is not implemented.
     */
    @PostMapping("/{reference}/contact")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void contact(@PathVariable String reference,
                        @Valid @RequestBody ContactRequestBody body) {
        requests.logContact(reference, body.channel(), body.direction(),
                trimmed(body.outcome()), trimmed(body.notes()),
                CurrentActor.require().actor());
    }

    /**
     * S10 — doc 58 §5, {@code reservation.win}:
     * <em>"→ salesStatus = WON + stayStatus = CONFIRMED, one transaction"</em>.
     *
     * <p>No body, for the same reason. Doc 54 S10's guard is availability,
     * acceptance and config B12 — none of which a request body could supply
     * without letting the caller assert its own guard.
     */
    /**
     * Doc 152 §3 — the hotel checked real availability and the rooms are free:
     * {@code PAYMENT_PENDING}, and the guest is emailed the hotel's QR and payment
     * instructions. The console counterpart of the hotel's email "approve" link,
     * which this retires.
     *
     * <p><strong>409</strong> unless the request is still awaiting review ·
     * <strong>422 {@code CONFIG_MISSING}</strong> when there is no payment
     * QR in the shared KAS payment account (V51). The email is sent after the transaction commits
     * and is skipped when email delivery is not configured.
     */
    @PostMapping("/{reference}/approve-payment")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @org.springframework.transaction.annotation.Transactional
    public void approvePayment(@PathVariable String reference) {
        notifications.paymentRequestSent(
                requests.approveAndRequestPayment(reference, CurrentActor.require().actor()));
    }

    /**
     * Doc 152 §5, amended 2026-11-07 — the requested rooms are not available, so the hotel
     * suggests another published stay. The request ENDS as {@code ALTERNATIVE_OFFERED}
     * (terminal), the suggestion email is queued, nothing is held and no new request is
     * created: a guest who wants it sends a new request on the website.
     */
    @PostMapping("/{reference}/propose-alternative")
    @PreAuthorize("hasAuthority('" + Permissions.SALES_REQUEST_MANAGE + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @org.springframework.transaction.annotation.Transactional
    public void proposeAlternative(@PathVariable String reference,
                                   @Valid @RequestBody ProposeAlternativeBody body) {
        notifications.alternativeOffered(
                requests.proposeAlternative(reference, body.toInput(), CurrentActor.require().actor()));
    }

    // POST /{reference}/confirm-payment ("payment received") was removed on 2026-11-14:
    // SePay is the only way to pay and only SePay confirms a payment (IPN or order-API poll).

    @PostMapping("/{reference}/win")
    @PreAuthorize("hasAuthority('" + Permissions.RESERVATION_WIN + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void win(@PathVariable String reference) {
        requests.win(reference, CurrentActor.require().actor());
    }

    /** An omitted or whitespace-only optional reason is absent, not empty text. */
    private static String trimmed(String reason) {
        if (reason == null) {
            return null;
        }
        String trimmed = reason.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
