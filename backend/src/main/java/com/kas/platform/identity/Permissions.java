package com.kas.platform.identity;

import java.util.Set;

/**
 * The frozen permission catalogue — doc 59 §4, transcribed exactly.
 *
 * <p><strong>No permission may be invented here.</strong> Doc 59 §1 requires
 * permission checks rather than hard-coded role checks wherever a future role
 * might need the same capability, which is why these are strings held as
 * constants and not an enum keyed to roles.
 *
 * <p>Two absences are deliberate and load-bearing:
 * <ul>
 *   <li><strong>There is no {@code review.edit}.</strong> Doc 59 §4.6:
 *       "Staff may never rewrite a guest's review." The capability does not
 *       exist, so it cannot be granted by a misconfigured bundle.</li>
 *   <li><strong>There is no permission that makes sales routes reach an OTA
 *       reservation.</strong> Doc 59 §4.1: every sales permission is
 *       structurally inapplicable to OTA, enforced by the route tree and by the
 *       {@code channel_type} CHECK constraints in the database.</li>
 * </ul>
 *
 * <p>These strings are the Spring Security authorities. They are a compile-time
 * constant expression so they can be used inside {@code @PreAuthorize}.
 */
public final class Permissions {

    private Permissions() {
    }

    // ---------------------------------------------------------------- §4.1 Direct Sales
    // DIRECT only. Never reachable for an OTA reservation.
    public static final String SALES_INQUIRY_MANAGE = "sales.inquiry.manage";
    public static final String SALES_FOLLOWUP_MANAGE = "sales.followup.manage";
    public static final String SALES_REQUEST_VIEW = "sales.request.view";
    public static final String SALES_REQUEST_CREATE = "sales.request.create";
    public static final String SALES_REQUEST_ASSIGN = "sales.request.assign";
    public static final String SALES_REQUEST_MANAGE = "sales.request.manage";
    /** Moves {@code salesStatus} to {@code WON}. Never named "confirm" — doc 58 §5. */
    public static final String RESERVATION_WIN = "reservation.win";
    /** Bounded; the bound is OQ-023 and is not yet supplied. */
    public static final String RESERVATION_PRICE_OVERRIDE = "reservation.price.override";

    // ---------------------------------------------------------------- §4.2 Operations
    // ALL channels. Operational queries use stayStatus, never salesStatus.
    public static final String RESERVATION_VIEW = "reservation.view";
    public static final String RESERVATION_CREATE = "reservation.create";
    public static final String RESERVATION_MODIFY = "reservation.modify";
    public static final String RESERVATION_CANCEL = "reservation.cancel";
    public static final String RESERVATION_CHECKIN = "reservation.checkin";
    public static final String INVENTORY_VIEW = "inventory.view";
    public static final String INVENTORY_ADJUST = "inventory.adjust";
    public static final String PAYMENT_RECORD = "payment.record";

    // ---------------------------------------------------------------- §4.3 Distribution
    public static final String RESERVATION_OTA_RECORD = "reservation.ota.record";
    public static final String RESERVATION_OTA_CANCEL = "reservation.ota.cancel";
    public static final String RESERVATION_OTA_RECONCILE = "reservation.ota.reconcile";
    public static final String DISTRIBUTION_BUFFER_MANAGE = "distribution.buffer.manage";

    // ---------------------------------------------------------------- §4.4 Commercial
    public static final String RATE_VIEW = "rate.view";
    public static final String RATE_MANAGE = "rate.manage";
    public static final String RATE_TAX_MANAGE = "rate.tax.manage";
    public static final String VOUCHER_MANAGE = "voucher.manage";
    /** Surcharges (early check-in, late check-out, extra guests, ...) and their conditions. */
    public static final String SURCHARGE_MANAGE = "surcharge.manage";

    // ---------------------------------------------------------------- §4.5 Content & media
    public static final String PROPERTY_MANAGE = "property.manage";
    /** Permanently delete a never-published hotel draft — ADMIN only (owner decision 2026-11-08). */
    public static final String PROPERTY_DELETE = "property.delete";
    public static final String ROOMTYPE_MANAGE = "roomtype.manage";
    public static final String AMENITY_MANAGE = "amenity.manage";
    public static final String CONTENT_MANAGE = "content.manage";
    public static final String CONTENT_PUBLISH = "content.publish";
    public static final String MEDIA_UPLOAD = "media.upload";
    public static final String MEDIA_PUBLISH = "media.publish";
    public static final String MEDIA_DELETE = "media.delete";

    // ---------------------------------------------------------------- §4.6 Customers & reviews
    /** Audited even when read-only — doc 59 §7.7. */
    public static final String CUSTOMER_VIEW = "customer.view";
    public static final String CUSTOMER_EDIT = "customer.edit";
    public static final String CUSTOMER_MERGE = "customer.merge";
    public static final String CUSTOMER_ANONYMISE = "customer.anonymise";
    /** Audited <em>and alerted</em> — doc 59 §4.6. */
    public static final String CUSTOMER_EXPORT = "customer.export";
    public static final String REVIEW_MODERATE = "review.moderate";
    public static final String REVIEW_REPLY = "review.reply";
    public static final String REVIEW_DELETE = "review.delete";
    // review.edit does not exist. See the class comment.

    // ---------------------------------------------------------------- §4.7 Platform
    public static final String ANALYTICS_SALES_VIEW = "analytics.sales.view";
    public static final String ANALYTICS_DISTRIBUTION_VIEW = "analytics.distribution.view";
    public static final String ANALYTICS_OPERATIONS_VIEW = "analytics.operations.view";
    public static final String ANALYTICS_FINANCIAL_VIEW = "analytics.financial.view";
    public static final String NOTIFICATION_MANAGE = "notification.manage";
    public static final String EMAIL_MANAGE = "email.manage";
    public static final String EMAIL_CAMPAIGN_SEND = "email.campaign.send";
    public static final String USER_MANAGE = "user.manage";
    public static final String ROLE_MANAGE = "role.manage";
    public static final String SETTINGS_MANAGE = "settings.manage";
    public static final String AUDIT_VIEW = "audit.view";
    public static final String INTEGRATION_MANAGE = "integration.manage";

    // ---------------------------------------------------------------- §4.8 Customer self-service
    public static final String ME_PROFILE_EDIT = "me.profile.edit";
    public static final String ME_PREFERENCES_EDIT = "me.preferences.edit";
    public static final String ME_CONSENT_EDIT = "me.consent.edit";
    public static final String ME_STAY_VIEW = "me.stay.view";
    public static final String ME_STAY_CANCEL = "me.stay.cancel";
    /** The guest asks to check out of their own stay; SUPER_ADMIN confirms (V59). */
    public static final String ME_STAY_CHECKOUT = "me.stay.checkout";
    public static final String REVIEW_CREATE = "review.create";
    public static final String ME_DATA_EXPORT = "me.data.export";
    public static final String ME_ACCOUNT_DELETE = "me.account.delete";

    /** OWN scope — doc 59 §4.8. Held by every authenticated actor. */
    static final Set<String> SELF_SERVICE = Set.of(
            ME_PROFILE_EDIT, ME_PREFERENCES_EDIT, ME_CONSENT_EDIT,
            ME_STAY_VIEW, ME_STAY_CANCEL, ME_STAY_CHECKOUT, REVIEW_CREATE,
            ME_DATA_EXPORT, ME_ACCOUNT_DELETE);

    /** The complete catalogue, for validation and for the RBAC coverage test. */
    public static final Set<String> ALL = Set.of(
            SALES_INQUIRY_MANAGE, SALES_FOLLOWUP_MANAGE, SALES_REQUEST_VIEW,
            SALES_REQUEST_CREATE, SALES_REQUEST_ASSIGN, SALES_REQUEST_MANAGE,
            RESERVATION_WIN, RESERVATION_PRICE_OVERRIDE,
            RESERVATION_VIEW, RESERVATION_CREATE, RESERVATION_MODIFY,
            RESERVATION_CANCEL, RESERVATION_CHECKIN, INVENTORY_VIEW,
            INVENTORY_ADJUST, PAYMENT_RECORD,
            RESERVATION_OTA_RECORD, RESERVATION_OTA_CANCEL,
            RESERVATION_OTA_RECONCILE, DISTRIBUTION_BUFFER_MANAGE,
            RATE_VIEW, RATE_MANAGE, RATE_TAX_MANAGE, VOUCHER_MANAGE, SURCHARGE_MANAGE,
            PROPERTY_MANAGE, PROPERTY_DELETE, ROOMTYPE_MANAGE, AMENITY_MANAGE,
            CONTENT_MANAGE, CONTENT_PUBLISH,
            MEDIA_UPLOAD, MEDIA_PUBLISH, MEDIA_DELETE,
            CUSTOMER_VIEW, CUSTOMER_EDIT, CUSTOMER_MERGE,
            CUSTOMER_ANONYMISE, CUSTOMER_EXPORT,
            REVIEW_MODERATE, REVIEW_REPLY, REVIEW_DELETE,
            ANALYTICS_SALES_VIEW, ANALYTICS_DISTRIBUTION_VIEW,
            ANALYTICS_OPERATIONS_VIEW, ANALYTICS_FINANCIAL_VIEW,
            NOTIFICATION_MANAGE, EMAIL_MANAGE, EMAIL_CAMPAIGN_SEND,
            USER_MANAGE, ROLE_MANAGE, SETTINGS_MANAGE, AUDIT_VIEW,
            INTEGRATION_MANAGE,
            ME_PROFILE_EDIT, ME_PREFERENCES_EDIT, ME_CONSENT_EDIT,
            ME_STAY_VIEW, ME_STAY_CANCEL, ME_STAY_CHECKOUT, REVIEW_CREATE,
            ME_DATA_EXPORT, ME_ACCOUNT_DELETE);
}
