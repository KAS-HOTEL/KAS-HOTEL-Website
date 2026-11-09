package com.kas.platform.contract;

import com.kas.platform.media.api.UploadUrlView;
import com.kas.platform.shared.Money;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The doc 58 §9 public response denylist, as an executable scanner.
 *
 * <p>Doc 58 §9 layer 4 requires exactly this: "every Public and {@code /me}
 * endpoint response, across all fixtures, is asserted against this denylist by
 * key name <strong>at any nesting depth</strong>."
 *
 * <h2>One documented exception: {@code total}</h2>
 *
 * <p>The denylist puts {@code total} in the INVENTORY group — the room count,
 * which must never be exposed. But doc 58 §4 returns {@code total} as the stay
 * price in the {@code /me} stay detail:
 *
 * <pre>"total": { "amountMinor": 12450000, "currency": "VND", "exponent": 0 }</pre>
 *
 * <p>The same name, two meanings. Matching purely on the name would forbid a
 * field the contract explicitly requires. The scanner therefore permits
 * {@code total} <em>only</em> when its declared type is {@link Money}: an
 * inventory count is an integer and can never satisfy that, so the exception
 * cannot be used to smuggle one through. Every other denylisted name is matched
 * on the name alone, regardless of type.
 *
 * <h2>A second documented exception: {@code expiresAt} on the upload URL</h2>
 *
 * <p>Doc 58 §9 lists {@code expiresAt} in the INVENTORY group, where it means
 * {@code hold.expires_at} — when a held room is released, which would tell a
 * guest how long a competitor's hold has left. Doc 62 §4 independently freezes a
 * field of the same name on the media upload response:
 *
 * <pre>POST /admin/media/upload-url → { uploadUrl, mediaAssetId, expiresAt }</pre>
 *
 * <p>That one is when a pre-signed URL stops working — the opposite of secret,
 * since a client that does not know it cannot retry sensibly, and it is returned
 * only to an authenticated {@code media.upload} caller.
 *
 * <p>The exception is bound to the <strong>declaring class</strong> rather than
 * the field type, which is tighter than the {@code total} rule: a hold view
 * carrying an expiry is a different class and is still caught. Renaming the field
 * was the alternative and was rejected — doc 62 §4 is frozen, and a scanner
 * should not quietly rewrite a contract to keep itself simple.
 */
public final class PublicResponseDenylist {

    /**
     * Doc 58 §9, transcribed group by group. Stored normalised: lower case with
     * separators removed, so {@code salesStatus}, {@code sales_status} and
     * {@code SALESSTATUS} all match.
     */
    private static final Set<String> DENIED = normalise(Set.of(
            // PHYSICAL
            "roomNumber", "floor", "unitId", "buildingSection", "assignedRoom",
            // INVENTORY
            "total", "reserved", "occupied", "maintenance", "otherBlocks",
            "otaAllotment", "bufferTarget", "directCommitted", "otaCommitted",
            "inventoryDayId", "holdId", "expiresAt", "holdType", "holdStatus",
            // SALES
            "salesStatus", "salesOwnerId", "salesOwner", "leadSource", "leadSourceDetail",
            "inquiryId", "slaDueAt", "slaBreached", "escalationLevel",
            "assignmentHistory", "followUpAt", "attemptCount",
            // DISTRIBUTION
            "distributionChannel", "distributionChannelId", "channelType",
            "otaReference", "recordingLag", "commissionBasis", "bufferUtilisation",
            // PARTNER
            "partnerId", "partnerCode", "partnerName", "partner", "legalName",
            // INTERNAL
            "internalNote", "reservationNote", "contactLog", "auditLog",
            "priceOverrideReason", "appliedRuleIds", "ruleId", "margin",
            // CUSTOMER
            "identityMatchConfidence", "mergeHistory", "mergedIntoId",
            "internalCustomerNote", "otherCustomerData",
            // MEDIA
            "storageKey", "bucket", "originalPath", "checksum",
            // SECURITY
            "passwordHash", "refreshTokenHash", "permissions", "roleAssignments"));

    private static final String TOTAL = "total";
    private static final String EXPIRES_AT = normalise("expiresAt");

    private PublicResponseDenylist() {
    }

    /**
     * Every denylisted field reachable from {@code root}, at any depth.
     *
     * @return human-readable violation paths; empty means the type is safe to
     *         return from a public or {@code /me} endpoint
     */
    public static List<String> violations(Class<?> root) {
        List<String> found = new ArrayList<>();
        walk(root, root.getSimpleName(), new HashSet<>(), found);
        return List.copyOf(found);
    }

    private static void walk(Class<?> type, String path, Set<Class<?>> visited, List<String> found) {
        if (type == null || isLeaf(type) || !visited.add(type)) {
            return;
        }
        for (Field field : type.getDeclaredFields()) {
            if (field.isSynthetic() || Modifier.isStatic(field.getModifiers())) {
                continue;
            }
            if (isDenied(field)) {
                found.add(path + "." + field.getName()
                        + "  →  denylisted by doc 58 §9");
            }
            for (Class<?> referenced : referencedTypes(field)) {
                walk(referenced, path + "." + field.getName(), visited, found);
            }
        }
    }

    private static boolean isDenied(Field field) {
        String name = normalise(field.getName());
        if (!DENIED.contains(name)) {
            return false;
        }
        // The two documented exceptions. See the class comment.
        boolean stayTotal = TOTAL.equals(name) && Money.class.equals(field.getType());
        boolean uploadExpiry = EXPIRES_AT.equals(name)
                && UploadUrlView.class.equals(field.getDeclaringClass());
        return !(stayTotal || uploadExpiry);
    }

    /** The field's own type plus any generic arguments, so collections are followed. */
    private static Set<Class<?>> referencedTypes(Field field) {
        Set<Class<?>> types = new LinkedHashSet<>();
        types.add(field.getType());
        if (field.getGenericType() instanceof ParameterizedType parameterized) {
            for (Type argument : parameterized.getActualTypeArguments()) {
                if (argument instanceof Class<?> argumentClass) {
                    types.add(argumentClass);
                }
            }
        }
        return types;
    }

    /**
     * Platform types are descended into; everything else terminates the walk.
     * A JDK or framework type cannot introduce a KAS domain field, and following
     * one would walk the whole class library.
     */
    private static boolean isLeaf(Class<?> type) {
        return type.isPrimitive()
                || type.isEnum()
                || type.isArray()
                || !type.getName().startsWith("com.kas.");
    }

    private static Set<String> normalise(Set<String> names) {
        return names.stream()
                .map(PublicResponseDenylist::normalise)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static String normalise(String name) {
        return name.toLowerCase(Locale.ROOT).replace("_", "").replace("-", "");
    }
}
