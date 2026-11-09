package com.kas.platform.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kas.platform.inventory.AvailabilityService;
import com.kas.platform.inventory.PublicAllocationRepository;
import com.kas.platform.pricing.ResolvedRate;
import com.kas.platform.reservation.api.RequestReceiptView;
import com.kas.platform.reservation.api.ReservationRequestBody;
import com.kas.platform.settings.SettingKey;
import com.kas.platform.settings.SystemSettingService;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.BusinessRuleException;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.Money;
import com.kas.platform.shared.NotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Request descriptions and price estimates only; hotel staff checks rooms manually (decision 153). */
@Component
class S1Transaction {

    /** Doc 56 §5.2 — the only basis V1 prices on. */
    private static final String BASIS = "PER_ROOM_PER_NIGHT";

    /**
     * The snapshot's revision number at S1 — doc 125 §5.
     *
     * <p>Every V1 snapshot is revision 1, because V1 implements no modification
     * flow and nothing re-versions anything. Doc 125 §6 freezes the increment rule
     * now so the first modification cannot invent one later.
     */
    private static final int SNAPSHOT_VERSION = 1;

    /**
     * Doc 58 §3.3’s own string, used verbatim.
     *
     * <p>The frozen 201 requires this field as a string, so the server must
     * supply one. It is in English because that is the language the contract
     * writes it in, and because <strong>no server-side i18n exists</strong> —
     * there is no {@code MessageSource} and no message bundle anywhere in the
     * backend. Authoring a Vietnamese translation here would invent guest-facing
     * copy, which config B27 (OQ-061) reserves for native copywriter review.
     *
     * <p>The precedent is {@code QuoteView.estimate}, which is a <em>boolean</em>:
     * the backend states the fact and the guest tree renders the sentence. These
     * two fields are strings only because doc 58 §3.3 froze them that way.
     */
    private static final String ESTIMATE_DISCLAIMER =
            "Final amount is confirmed by the KAS team.";

    private final AvailabilityService availability;
    private final com.kas.platform.inventory.PublicAllocationRepository allocation;
    private final ReservationRepository reservations;
    private final IdempotencyRepository idempotency;
    private final SystemSettingService settings;
    private final ObjectMapper json;
    private final Clock clock;
    private final BookingNotificationService notifications;

    S1Transaction(AvailabilityService availability, PublicAllocationRepository allocation,
                  ReservationRepository reservations, IdempotencyRepository idempotency,
                  SystemSettingService settings, ObjectMapper json, Clock clock,
                  BookingNotificationService notifications) {
        this.availability = availability;
        this.allocation = allocation;
        this.reservations = reservations;
        this.idempotency = idempotency;
        this.settings = settings;
        this.json = json;
        this.clock = clock;
        this.notifications = notifications;
    }

    @Transactional
    RequestReceiptView execute(String idempotencyKey, String fingerprint,
                               ReservationRequestBody body, String locale, UUID customerUserId) {

        UUID propertyId = allocation.bookablePropertyId(body.propertySlug())
                // 404, never 403 — doc 85 §6.3. A DRAFT property, a closed one and a
                // slug that never existed are the same answer to a guest.
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        // Validate occupancy and calculate an estimate, but do not claim the
        // hotel has availability. Hotel staff checks actual rooms after submission.
        AvailabilityService.PricedRequest priced = availability.priceRequestForManualReview(
                body.propertySlug(), body.checkIn(), body.checkOut(), body.adults(),
                body.children(), body.childAgesOrEmpty(),
                body.linesOrEmpty().stream()
                        .map(line -> new AvailabilityService.QuoteLine(line.roomTypeSlug(),
                                line.quantity()))
                        .toList(),
                body.offerCode(), locale);

        // The snapshot's propertyName — doc 125 §7.2. Read AFTER priceRequest on
        // purpose: priceRequest already refuses a locale this property cannot be
        // presented in, so an unsupported locale keeps returning its existing 422
        // rather than becoming a new 404 here.
        String propertyName = allocation.bookablePropertyName(body.propertySlug(), locale)
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        // ONE clock, read once. Doc 117 §9: responsePromise and sla_due_at derive
        // from the same A6 value, and a client-supplied time is never trusted.
        OffsetDateTime requestedAt = OffsetDateTime.now(clock);
        Duration sla = settings.requireDuration(SettingKey.SALES_FIRST_CONTACT_SLA);
        OffsetDateTime slaDueAt = requestedAt.plus(sla);
        List<AvailabilityService.PricedLine> ordered = priced.lines();

        UUID reservationId = UUID.randomUUID();
        String reference = allocateReference(propertyId);
        UUID customerId = customerUserId == null ? null : reservations.customerIdForUser(customerUserId)
                .orElseThrow(() -> new IllegalStateException(
                        "Authenticated customer profile is missing."));
        UUID channelId = reservations.directChannelId().orElseThrow(() ->
                new BusinessRuleException(ApiErrorCode.CONFIG_MISSING,
                        "The DIRECT distribution channel is not configured."));

        String snapshot = priceSnapshot(priced, propertyId, propertyName, requestedAt,
                body.acceptedTermsVersion());

        reservations.insertReservation(reservationId, reference, propertyId, channelId, customerId,
                body.checkIn(), body.checkOut(), body.adults(), body.children(),
                body.guest().fullName(), body.guest().email(), body.guest().phone(),
                normaliseCountry(body.guest().country()), body.guest().preferredChannel(),
                body.specialRequests(), body.discoveryChannel(),
                // OQ-167, closed by doc 117 §24.2: stored opaquely, never validated,
                // never looked up against the policy catalogue.
                body.acceptedTermsVersion(),
                priced.currency(), priced.roomsSubtotalMinor(), priced.roomsSubtotalMinor(),
                snapshot, requestedAt, slaDueAt);

        if (customerId != null) {
            reservations.insertMembershipSnapshot(reservationId, customerId,
                    priced.currency(), requestedAt);
        }

        for (AvailabilityService.PricedLine line : ordered) {
            reservations.insertLine(reservationId, line.roomTypeId(), line.quantity(),
                    line.roomTypeName(), uniformNightlyRate(line), line.subtotalMinor());
        }

        reservations.insertS1History(reservationId);

        RequestReceiptView receipt = receipt(reference, priced, sla);

        // Claimed last, because response_snapshot is NOT NULL and the response does
        // not exist until the work is done. The PRIMARY KEY makes this the point
        // where a concurrent duplicate loses and rolls everything back.
        idempotency.insert(idempotencyKey, fingerprint, reservationId, write(receipt));

        // Queued here so the mail commits or rolls back with the reservation. This
        // must stay inside S1: a caller's surrounding transaction would make a unique
        // violation abort the replay and retry in ReservationRequestService.
        notifications.bookingRequestReceived(body, receipt, locale);
        return receipt;
    }

    /**
     * The frozen 201 of doc 117 §12.
     *
     * <p>{@code responsePromise} and {@code sla_due_at} derive from the same A6
     * duration — §9 forbids two calculations. This renders it for the guest;
     * {@code sla_due_at} stores the instant.
     *
     * <p>{@code trackingUrlIssued} is <strong>false</strong>: issuing a tracking
     * link is part of the acknowledgement, and delivery is OQ-162, explicitly out
     * of Step 16A by doc 117 §8.1. Reporting {@code true} would claim something
     * the system did not do.
     */
    private RequestReceiptView receipt(String reference, AvailabilityService.PricedRequest priced,
                                       Duration sla) {
        int exponent = Money.VND.equals(priced.currency()) ? 0 : 2;
        return new RequestReceiptView(
                reference,
                RequestReceiptView.REQUEST_RECEIVED,
                responsePromise(sla),
                false,
                new Money(priced.roomsSubtotalMinor(), priced.currency(), exponent),
                ESTIMATE_DISCLAIMER);
    }

    /**
     * The promise, in hours, from the single A6 value.
     *
     * <p>Deliberately mechanical. Doc 51 §2 defines A6 as also covering cutoff
     * hour, weekends, holidays and escalation, and doc 117 §2 defers all four
     * (OQ-161) — so this renders the duration and nothing else. No calendar, no
     * business-hours arithmetic, no escalation.
     *
     * <p>English, for the reason given on {@link #ESTIMATE_DISCLAIMER}: the
     * backend has no localisation mechanism, and inventing Vietnamese copy is
     * OQ-061’s territory. The hours come from A6 and nowhere else, so if A6
     * changes this sentence changes with it — doc 117 §9.
     */
    private String responsePromise(Duration sla) {
        return "Within " + sla.toHours() + " hours";
    }

    /**
     * The price snapshot — the typed shape frozen by doc 125 §11, completing doc
     * 117 §14.1.
     *
     * <p><strong>OQ-171, now closed:</strong> {@code version} is the snapshot
     * <em>revision number</em> and is {@link #SNAPSHOT_VERSION} at S1 (doc 125
     * §4–§6); {@code propertyId} and {@code propertyName} freeze the property's
     * identity at snapshot time (§7.2); {@code appliedRuleIds} is the ordered
     * distinct union of {@code nights[].ruleId} (§8).
     *
     * <p><strong>Absent by decision:</strong> {@code taxes} and
     * {@code serviceChargeMinor} — doc 117 §14.2 removed both when A7 was retired
     * — and any JSON-schema-version field, which doc 125 §4 states V1 does not
     * have.
     *
     * <p>{@code ruleId} and {@code ruleName} are omitted for a night the base rate
     * priced: {@link ResolvedRate#fromBase} leaves them null, and a null there is
     * the honest record that no rule applied, not a missing value.
     */
    private String priceSnapshot(AvailabilityService.PricedRequest priced,
                                 UUID propertyId, String propertyName,
                                 OffsetDateTime computedAt, String termsVersion) {
        ObjectNode root = json.createObjectNode();
        // The snapshot's own revision number — NOT reservation.version, which is
        // the optimistic-locking column, starts at 0 and is neither read nor
        // written here (doc 125 §7).
        root.put("version", SNAPSHOT_VERSION);
        root.put("computedAt", computedAt.toString());
        root.put("currency", priced.currency());
        root.put("basis", BASIS);
        root.put("propertyId", propertyId.toString());
        root.put("propertyName", propertyName);

        ArrayNode lines = root.putArray("lines");
        for (AvailabilityService.PricedLine line : priced.lines()) {
            ObjectNode node = lines.addObject();
            node.put("roomTypeId", line.roomTypeId().toString());
            node.put("roomTypeName", line.roomTypeName());
            node.put("quantity", line.quantity());

            ArrayNode nights = node.putArray("nights");
            for (ResolvedRate rate : line.nights()) {
                ObjectNode night = nights.addObject();
                night.put("date", rate.date().toString());
                night.put("rateMinor", rate.amountMinor());
                if (rate.ruleId() != null) {
                    night.put("ruleId", rate.ruleId().toString());
                }
                if (rate.ruleName() != null) {
                    night.put("ruleName", rate.ruleName());
                }
            }
            node.put("lineTotalMinor", line.subtotalMinor());
        }

        root.put("subtotalMinor", priced.roomsSubtotalMinor());

        // An offer code is refused before this point (doc 117 §13), so the discount
        // is structurally zero rather than a decision taken here.
        ObjectNode discount = root.putObject("discount");
        discount.putNull("voucherId");
        discount.put("amountMinor", 0);

        root.put("totalMinor", priced.roomsSubtotalMinor());

        ArrayNode applied = root.putArray("appliedRuleIds");
        appliedRuleIds(priced).forEach(applied::add);

        if (termsVersion != null) {
            root.put("termsVersion", termsVersion);
        }
        return write(root);
    }

    /**
     * The ordered distinct union of every {@code nights[].ruleId} in the snapshot
     * — doc 125 §8.
     *
     * <p>A base-rate night contributes nothing: {@link ResolvedRate#fromBase}
     * leaves {@code ruleId} null. A rule that priced twenty nights appears once.
     * When no night had a rule the result is empty, and the caller writes
     * {@code []} — present and explicit, never omitted and never null.
     *
     * <p><strong>Ordering</strong> is ascending by the rule id's canonical
     * lowercase string, which is what {@link UUID#toString()} produces. It is
     * deliberately <em>not</em> {@link UUID#compareTo}, which orders by signed
     * 64-bit halves and would disagree with the string order the contract names.
     *
     * <p>Internal only — doc 58 §9's denylist keeps {@code appliedRuleIds} and
     * {@code ruleId} out of every guest-facing response, and nothing here changes
     * that: the snapshot is server-side and no endpoint returns it.
     */
    private static List<String> appliedRuleIds(AvailabilityService.PricedRequest priced) {
        return priced.lines().stream()
                .flatMap(line -> line.nights().stream())
                .map(ResolvedRate::ruleId)
                .filter(Objects::nonNull)
                .map(UUID::toString)
                .distinct()
                .sorted()
                .toList();
    }

    /**
     * The line's nightly rate when every night shares one, otherwise {@code null}
     * — doc 125 §9.
     *
     * <p>First, lowest, highest and average are all forbidden: a rendered figure
     * equal to no night actually charged is worse than an absent one. The
     * authoritative per-night detail is {@code price_snapshot.lines[].nights[]}
     * (doc 125 §10), which is written regardless.
     *
     * <p>This is the per-room rate, not the line total — {@code quantity} is
     * deliberately not applied, matching what {@code nightly_price_minor} means.
     */
    private static Long uniformNightlyRate(AvailabilityService.PricedLine line) {
        List<ResolvedRate> nights = line.nights();
        if (nights.isEmpty()) {
            return null;
        }
        long first = nights.get(0).amountMinor();
        return nights.stream().allMatch(rate -> rate.amountMinor() == first) ? first : null;
    }

    /**
     * {@code KAS} + the property's branch code + five random digits.
     *
     * <p>This was {@code KAS-YYMMDD-XXXX}, which encoded the day a booking was
     * taken and nothing about the hotel. The format is now
     * {@code KAS0512345} — see {@link ReservationReference}.
     *
     * <h2>One draw, not a loop</h2>
     *
     * The old version drew up to eight candidates and asked the database
     * whether each already existed. That check is a read in the same
     * transaction as the insert, so it never actually excluded a concurrent
     * writer — the UNIQUE constraint was doing the work either way, and the
     * reads only made a collision slightly less likely to be observed.
     *
     * <p>So one candidate is drawn and inserted. If the constraint refuses it,
     * {@code ReservationRequestService} retries the whole transaction with a
     * fresh draw, which is the only retry that is correct here: a unique
     * violation aborts the Postgres transaction, and nothing can be salvaged
     * inside it.
     */
    private String allocateReference(UUID propertyId) {
        return ReservationReference.candidate(reservations.branchCodeOf(propertyId).orElse(null));
    }

    private static BusinessRuleException noAvailability(String roomTypeSlug, int requested,
                                                        int availableForStay) {
        return new BusinessRuleException(ApiErrorCode.NO_AVAILABILITY,
                "Those rooms are no longer available for these dates.",
                List.of(new KasException.ErrorDetail(roomTypeSlug, "NO_AVAILABILITY",
                        "Requested " + requested + ", available for the stay "
                                + availableForStay + ".")));
    }

    /**
     * Upper-cases the two-letter code the request validated.
     *
     * <p>Shape is already guaranteed by {@code @Pattern} on the DTO, so a
     * malformed country was refused with a 400 long before this point. Nothing is
     * discarded here — an earlier version returned NULL for anything it did not
     * recognise, which silently threw away what the guest typed.
     */
    private static String normaliseCountry(String country) {
        if (country == null || country.isBlank()) {
            return null;
        }
        return country.trim().toUpperCase(java.util.Locale.ROOT);
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("could not serialise reservation JSON", e);
        }
    }

}
