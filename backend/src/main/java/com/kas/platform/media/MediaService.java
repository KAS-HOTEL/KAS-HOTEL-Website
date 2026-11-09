package com.kas.platform.media;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Media management for the Partner.
 *
 * <p>Two rules from doc 62 are enforced here rather than left to callers:
 * the platform assigns the storage key (§3), and <strong>alt text is a publish
 * gate</strong> (§5).
 */
@Service
public class MediaService {

    private static final String ENTITY = "media";

    /**
     * MIME types accepted for an image asset.
     *
     * <p>Restricted to raster formats, and <strong>{@code image/svg+xml} is
     * deliberately excluded.</strong> SVG is an XML document that can carry
     * script and external references; served from a delivery origin it is an
     * XSS vector, not a photograph. Doc 10 §5.1 requires "type and magic-byte
     * validation… never executable", and this is the type half.
     *
     * <p>No size or dimension limit is applied. Doc 62 §4 says "bounded per
     * category" but supplies no numbers, and the phase brief forbids inventing
     * them — see OQ-107.
     */
    private static final Set<String> ACCEPTED_MIME_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp", "image/avif");

    private final MediaRepository media;
    private final AuditLogger audit;
    private final StorageProvider storage;

    public MediaService(MediaRepository media, AuditLogger audit, StorageProvider storage) {
        this.media = media;
        this.audit = audit;
        this.storage = storage;
    }

    // ------------------------------------------------------------------ upload

    /**
     * Doc 62 §4 step 1 — registers the asset and mints a URL the browser uploads
     * to directly.
     *
     * <p>One call, not two: the asset must exist before a URL can be signed for
     * its key, and splitting them would leave a client able to register an asset
     * it never gets a URL for. It reuses {@link #registerAsset} whole, so the
     * type allowlist, the platform-assigned key and the audit record are the
     * existing ones rather than a second implementation of them.
     *
     * <p><strong>No bytes pass through this server.</strong> The response carries
     * a URL to storage; the browser {@code PUT}s to it.
     *
     * @throws com.kas.platform.shared.MissingConfigurationException when no
     *         object storage is configured — naming the property, rather than
     *         returning a URL that goes nowhere
     */
    @Transactional
    public Upload beginUpload(UUID partnerId, String mimeType, String category,
                              Integer width, Integer height, Long sizeBytes,
                              ResolvedActor actor, AuthorizationScope scope) {

        MediaAsset asset = registerAsset(partnerId, mimeType, category, width, height, sizeBytes,
                actor, scope);

        String storageKey = media.storageKeyOf(asset.id(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media asset"));

        StorageProvider.PresignedUpload presigned = storage.presignedUpload(storageKey, mimeType);

        // The key is not in the audit record: it is internal (doc 62 §2), and the
        // asset id already identifies the row an auditor would look up.
        audit(actor, "media.upload_url_issued", asset.id(),
                Map.of("expiresAt", presigned.expiresAt().toString()), scope);

        return new Upload(asset.id(), presigned.url(), presigned.expiresAt());
    }

    /**
     * Doc 62 §4 step 3 — the upload is finished, so check what actually landed.
     *
     * <p>Order matters. Scope first, so a stranger's asset id is a 404 before
     * anything else can distinguish itself. Then existence, so an unfinished
     * upload is told apart from a finished one. Then the content type storage
     * reports, then the magic bytes, because a declared type is a claim and the
     * first bytes are the file.
     *
     * <p>Size and checksum are taken <strong>from storage</strong>, never from
     * the client — a declared size cannot then disagree with the stored object.
     *
     * <p><strong>Status stays {@code DRAFT}.</strong> Completing an upload is not
     * publishing: doc 62 §5's alt-text gate is untouched and remains the only
     * road to {@code PUBLISHED}.
     *
     * @throws KasException {@code VALIDATION_FAILED} when no object is present,
     *                      the type disagrees, or the bytes are not the type they
     *                      claim to be
     */
    @Transactional
    public MediaAsset completeUpload(UUID assetId, ResolvedActor actor, AuthorizationScope scope) {
        MediaAsset asset = requireAsset(assetId, scope);
        if (asset.externalUrl() != null) throw refuse("mediaAssetId", "EXTERNAL_SOURCE", "An external image does not use an R2 upload.");
        String storageKey = media.storageKeyOf(assetId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media asset"));

        StorageProvider.StoredObject object = storage.head(storageKey)
                .orElseThrow(() -> refuse("upload", "NOT_UPLOADED",
                        "No file has been uploaded for this asset yet."));

        rejectTypeMismatch(asset, object);
        rejectWrongMagicBytes(asset, storageKey);

        // Doc 62 §4 — "repeat upload of the same checksum returns the existing
        // asset". Checked before the metadata is written, so the duplicate never
        // becomes a second live record of the same bytes.
        Optional<UUID> existing = media.findLiveAssetByChecksum(
                asset.partnerId(), object.checksum(), assetId, scope);
        if (existing.isPresent()) {
            return foldIntoExisting(assetId, storageKey, existing.get(), actor, scope);
        }

        media.recordUpload(assetId, object.sizeBytes(), object.checksum(), scope);

        audit(actor, "media.upload_completed", assetId,
                Map.of("sizeBytes", object.sizeBytes()), scope);

        return requireAsset(assetId, scope);
    }

    /**
     * The duplicate is archived and its object removed; the original is returned.
     *
     * <p>Doc 62 §4 wants the caller to end up with the existing asset, and it
     * would be a poor kind of deduplication that left the second copy of the bytes
     * sitting in the bucket. The row is archived rather than deleted because
     * {@code media_link} references assets with {@code ON DELETE RESTRICT} and
     * because an archived row keeps the audit trail addressable.
     */
    private MediaAsset foldIntoExisting(UUID duplicateId, String duplicateKey, UUID existingId,
                                        ResolvedActor actor, AuthorizationScope scope) {
        media.setAssetStatus(duplicateId, MediaStatus.ARCHIVED, scope);
        storage.delete(duplicateKey);

        audit(actor, "media.upload_deduplicated", duplicateId,
                Map.of("existingAssetId", existingId.toString()), scope);

        return requireAsset(existingId, scope);
    }

    /**
     * What storage says the object is, against what the asset was registered as.
     *
     * <p>R2 records the content type the pre-signed URL bound, so a mismatch
     * means the two were signed apart — worth refusing rather than trusting
     * either one.
     */
    private void rejectTypeMismatch(MediaAsset asset, StorageProvider.StoredObject object) {
        String stored = object.contentType();
        if (stored != null && !stored.isBlank() && !stored.equalsIgnoreCase(asset.mimeType())) {
            throw refuse("mimeType", "TYPE_MISMATCH",
                    "The uploaded file is not the type this asset was registered as.");
        }
    }

    /** Doc 62 §4's magic-byte check, on a ranged read of the first bytes. */
    private void rejectWrongMagicBytes(MediaAsset asset, String storageKey) {
        byte[] header = storage.readHeader(storageKey, MagicBytes.HEADER_BYTES)
                .orElseThrow(() -> refuse("upload", "NOT_UPLOADED",
                        "No file has been uploaded for this asset yet."));

        if (!MagicBytes.matches(asset.mimeType(), header)) {
            throw refuse("upload", "CONTENT_MISMATCH",
                    "The uploaded file's contents are not a " + asset.mimeType() + " image.");
        }
    }

    private static KasException refuse(String field, String code, String message) {
        return new KasException(ApiErrorCode.VALIDATION_FAILED, message,
                List.of(new KasException.ErrorDetail(field, code, message)));
    }

    /**
     * Refuses to make an archived asset into live content.
     *
     * <h2>Why an archived asset is not merely "old"</h2>
     *
     * The one thing that archives an asset today is {@link #foldIntoExisting},
     * and it does two things at once: it flips the row to {@code ARCHIVED} and it
     * <strong>deletes the object from the bucket</strong>. So an archived asset is
     * not a retired photograph that could be brought back — it is a row whose
     * bytes are gone. Attaching it, publishing it or making it a property's cover
     * produces a gallery tile and a delivery URL that resolve to nothing, in front
     * of guests.
     *
     * <h2>Why the status check is not enough on its own, and why it is here</h2>
     *
     * {@code findAssetsForPartner} hides archived rows from the library, so the
     * picker cannot offer one. That is a filter on one read, not a rule: the ids
     * are stable and the routes take them directly, so anything holding an id
     * from before the fold — a stale tab, a retried request, a second client —
     * still reaches {@code attach} and {@code publishAsset}. The service is where
     * every one of those paths meets, which is why the rule lives here rather
     * than in a query.
     *
     * <p>Detach, reorder and archiving a link stay open. This refuses the three
     * transitions that turn an archived asset back into something a guest can be
     * shown, and nothing else — a partner tidying a gallery is never blocked.
     *
     * <p>{@code VALIDATION_FAILED} rather than a 404: the asset genuinely exists
     * and belongs to this partner, and saying so is not a disclosure. Reporting it
     * as absent would send a partner looking for a row that is right there.
     */
    private static void rejectArchived(MediaAsset asset) {
        if (asset.status() == MediaStatus.ARCHIVED) {
            throw refuse("mediaAssetId", "ASSET_ARCHIVED",
                    "This image has been archived and can no longer be published, "
                    + "attached or used as a cover.");
        }
    }

    /** The doc 62 §4 step 1 response: where to PUT, which asset, and until when. */
    public record Upload(UUID mediaAssetId, String uploadUrl, java.time.Instant expiresAt) {
    }

    // ------------------------------------------------------------------ assets

    /**
     * Registers an asset in the partner's library.
     *
     * <p>The caller supplies the file's metadata; the <strong>platform</strong>
     * assigns the storage key (doc 62 §3). A client-supplied key would be a
     * path-traversal and object-overwrite vector, so there is no parameter for
     * one — the field does not exist on the request type either.
     */
    @Transactional
    public MediaAsset registerAsset(UUID partnerId, String mimeType, String category,
                                    Integer width, Integer height, Long sizeBytes,
                                    ResolvedActor actor, AuthorizationScope scope) {
        if (!ACCEPTED_MIME_TYPES.contains(mimeType)) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "That file type cannot be used as a media asset.",
                    List.of(new KasException.ErrorDetail("mimeType", "UNSUPPORTED_TYPE",
                            "Accepted types are " + String.join(", ", ACCEPTED_MIME_TYPES) + ".")));
        }

        UUID assetId = UUID.randomUUID();
        UUID id = media.createAsset(assetId, partnerId, storageKeyFor(assetId), mimeType, category,
                        width, height, sizeBytes, actor.userId(), scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Partner"));

        audit(actor, "media.asset.registered", id, Map.of("category", category), scope);
        return media.findAsset(id, scope).orElseThrow(() -> NotFoundException.outOfScope("Media"));
    }

    /**
     * The object key, which is the delivery path — {@code m/{assetId}}.
     *
     * <h2>Why the key and the public path are the same string</h2>
     *
     * <p>{@link DeliveryUrlStorageProvider} composes {@code {base}/m/{assetId}}
     * and doc 62 §6 puts a CDN or bucket origin at that base. The key used to be
     * {@code p/{partnerId}/{random}}, so the delivery URL addressed a path the
     * origin had nothing at: every image 404'd, whatever the base pointed at.
     * Live verification found it — a real photograph uploaded through the real
     * pre-signed URL, confirmed present by {@code head}, and unreachable at the
     * URL the guest was handed.
     *
     * <p>Making the key the path is the smallest fix that keeps the frozen
     * {@code /m/{assetId}} contract, needs no route, no redirect and no CDN
     * rewrite rule, and keeps image bytes off this server — the application
     * still never touches them.
     *
     * <h2>What is given up, and why it is safe</h2>
     *
     * <p>The old key partitioned by partner so an operator browsing the bucket
     * could not walk across partners. That partitioning is gone. It bought less
     * than it looks: an R2 bucket is not publicly listable, the key is reachable
     * only with credentials or by knowing the id, and the asset id is already
     * public — every gallery response carries it. In exchange the key stops
     * carrying a partner id into a URL a guest can read.
     *
     * <p>Still opaque and unguessable: a random v4 UUID, never derived from a
     * filename, so an attacker-supplied name cannot reach an object key.
     *
     * <h2>Existing assets</h2>
     *
     * <p>This changes new keys only. {@code storage_key} is stored per row and
     * every read goes through it, so assets written under the old shape keep
     * addressing their own objects for {@code head}, {@code readHeader} and
     * {@code delete}. Nothing is rewritten, moved or deleted.
     */
    private static String storageKeyFor(UUID assetId) {
        return "m/" + assetId;
    }

    public MediaAsset requireAsset(UUID assetId, AuthorizationScope scope) {
        return media.findAsset(assetId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media asset"));
    }

    public List<MediaAsset> library(UUID partnerId, AuthorizationScope scope) {
        return media.findAssetsForPartner(partnerId, scope);
    }

    public UUID partnerForOwner(MediaOwnerType type, UUID ownerId, AuthorizationScope scope) {
        return media.partnerForOwner(type, ownerId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media owner"));
    }

    /** Registers an approved HTTPS reference without downloading or proxying remote bytes. */
    @Transactional
    public MediaAsset addExternal(String url, String mimeType, String category, MediaOwnerType ownerType,
                                  UUID ownerId, int displayOrder, String altVi, String altEn,
                                  ResolvedActor actor, AuthorizationScope scope) {
        validateExternalUrl(url);
        UUID partnerId = partnerForOwner(ownerType, ownerId, scope);
        MediaAsset asset = media.findExternal(url.trim(), partnerId, scope).orElse(null);
        if (asset == null) {
            asset = registerAsset(partnerId, mimeType, category, null, null, null, actor, scope);
            try { media.setExternalUrl(asset.id(), url.trim(), scope); }
            catch (org.springframework.dao.DuplicateKeyException duplicate) {
                throw ConflictException.versionConflict("External image reference");
            }
            describe(asset.id(), "vi", altVi.trim(), null, actor, scope);
            describe(asset.id(), "en", altEn.trim(), null, actor, scope);
            asset = publishAsset(asset.id(), actor, scope);
        }
        rejectArchived(asset);
        if (asset.status() != MediaStatus.PUBLISHED) {
            describe(asset.id(), "vi", altVi.trim(), null, actor, scope);
            describe(asset.id(), "en", altEn.trim(), null, actor, scope);
            asset = publishAsset(asset.id(), actor, scope);
        }
        UUID assetId = asset.id();
        if (media.findLinks(ownerType, ownerId, scope).stream().anyMatch(link -> link.mediaAssetId().equals(assetId))) {
            return requireAsset(assetId, scope);
        }
        MediaLink link = attach(asset.id(), ownerType, ownerId, displayOrder, actor, scope);
        setLinkStatus(link.id(), MediaStatus.PUBLISHED, actor, scope);
        return requireAsset(asset.id(), scope);
    }

    static void validateExternalUrl(String value) {
        try {
            java.net.URI uri = java.net.URI.create(value.trim());
            if (value.length() > 2048 || !"https".equals(uri.getScheme()) || uri.getHost() == null
                    || uri.getRawUserInfo() != null || uri.getRawFragment() != null) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException | NullPointerException invalid) {
            throw refuse("url", "INVALID_URL", "Use an absolute HTTPS image URL without credentials or fragments.");
        }
    }

    /**
     * Every cover the caller's scope reaches, for one kind of owner.
     *
     * <p>A read, so no transaction and no audit entry: looking at a portfolio is
     * not an act. Scope is the only filter, exactly as it is for the library.
     */
    public List<MediaRepository.Cover> covers(MediaOwnerType ownerType, AuthorizationScope scope) {
        return media.findCovers(ownerType, scope);
    }

    @Transactional
    public MediaAsset describe(UUID assetId, String locale, String altText, String caption,
                               ResolvedActor actor, AuthorizationScope scope) {
        requireAsset(assetId, scope);
        media.setTranslation(assetId, locale, altText, caption, scope);
        audit(actor, "media.asset.described", assetId, Map.of("locale", locale), scope);
        return requireAsset(assetId, scope);
    }

    /**
     * Files an image under another gallery category — "Phòng nghỉ", "Sảnh & lễ tân",
     * … on the hotel's gallery (owner decision, 2026-11-08). The category was fixed at
     * upload until now, so a photo filed wrongly could only be removed and uploaded again.
     */
    @Transactional
    public MediaAsset recategorize(UUID assetId, String category, ResolvedActor actor,
                                   AuthorizationScope scope) {
        MediaAsset before = requireAsset(assetId, scope);
        rejectArchived(before);
        media.setAssetCategory(assetId, category, scope);
        audit(actor, "media.asset.recategorized", assetId,
                Map.of("from", before.category(), "to", category), scope);
        return requireAsset(assetId, scope);
    }

    /**
     * Publishes an asset. <strong>Alt text in both locales is required.</strong>
     *
     * <p>Doc 62 §5 makes this a publish gate, and gives the reason: a screen
     * reader user meets an unlabelled image as a dead end, and English alt text
     * on a Vietnamese page "is itself a failure". It is enforced here because the
     * database cannot express "two rows must exist before this column may change".
     */
    @Transactional
    public MediaAsset publishAsset(UUID assetId, ResolvedActor actor, AuthorizationScope scope) {
        rejectArchived(requireAsset(assetId, scope));

        if (media.altTextLocaleCount(assetId, scope) < 2) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Alt text is required in both locales before this image can be published.",
                    List.of(new KasException.ErrorDetail("altText", "REQUIRED",
                            "Provide alt text for 'en' and 'vi'.")));
        }
        media.setAssetStatus(assetId, MediaStatus.PUBLISHED, scope);
        audit(actor, "media.asset.published", assetId, Map.of(), scope);
        return requireAsset(assetId, scope);
    }

    // ------------------------------------------------------------------- links

    /** Attaches an asset to a property or room type. Both ends are scope-checked. */
    @Transactional
    public MediaLink attach(UUID assetId, MediaOwnerType ownerType, UUID ownerId,
                            int displayOrder, ResolvedActor actor, AuthorizationScope scope) {
        if (!ownerType.isPartnerManageable()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Media cannot be attached to that owner type.",
                    List.of(new KasException.ErrorDetail("ownerType", "UNSUPPORTED_OWNER",
                            "Supported owners are PROPERTY and ROOM_TYPE.")));
        }
        // Checked before the link is created, so an archived asset cannot enter a
        // gallery at all rather than entering it and being filtered out later.
        rejectArchived(requireAsset(assetId, scope));

        UUID linkId = media.link(assetId, ownerType, ownerId, displayOrder, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media asset or owner"));

        audit(actor, "media.attached", linkId,
                Map.of("ownerType", ownerType.name(), "ownerId", ownerId.toString()), scope);
        return requireLink(linkId, scope);
    }

    public MediaLink requireLink(UUID linkId, AuthorizationScope scope) {
        return media.findLink(linkId, scope)
                .orElseThrow(() -> NotFoundException.outOfScope("Media link"));
    }

    public List<MediaLink> links(MediaOwnerType ownerType, UUID ownerId,
                                 AuthorizationScope scope) {
        return media.findLinks(ownerType, ownerId, scope);
    }

    /** Detaches without destroying the asset — doc 62 §2, one asset, many galleries. */
    @Transactional
    public void detach(UUID linkId, ResolvedActor actor, AuthorizationScope scope) {
        MediaLink link = requireLink(linkId, scope);
        media.detach(linkId, scope);
        audit(actor, "media.detached", linkId,
                Map.of("ownerType", link.ownerType().name()), scope);
    }

    /** Makes a link the cover. The previous cover is cleared in the same transaction. */
    @Transactional
    public MediaLink setCover(UUID linkId, ResolvedActor actor, AuthorizationScope scope) {
        // The cover is the one image a property shows before anything else, so a
        // link that predates this rule must not be promoted to it either.
        rejectArchived(requireAsset(requireLink(linkId, scope).mediaAssetId(), scope));

        if (!media.setCover(linkId, scope)) {
            throw ConflictException.versionConflict("Media cover");
        }
        audit(actor, "media.cover_changed", linkId, Map.of(), scope);
        return requireLink(linkId, scope);
    }

    @Transactional
    public MediaLink reorder(UUID linkId, int displayOrder, ResolvedActor actor,
                             AuthorizationScope scope) {
        requireLink(linkId, scope);
        media.setDisplayOrder(linkId, displayOrder, scope);
        audit(actor, "media.reordered", linkId, Map.of("displayOrder", displayOrder), scope);
        return requireLink(linkId, scope);
    }

    /**
     * Publishes a link, so the attachment may appear publicly.
     *
     * <p>Publishing the link is not enough on its own: the public query also
     * requires the asset to be published and the owning property or room type to
     * be publicly visible. See {@code PublishedMediaRepository}.
     */
    @Transactional
    public MediaLink setLinkStatus(UUID linkId, MediaStatus status, ResolvedActor actor,
                                   AuthorizationScope scope) {
        MediaLink link = requireLink(linkId, scope);
        // Archiving a link is always allowed — that is how a gallery is tidied.
        // Publishing one whose asset is archived is what this refuses.
        if (status.isPublished()) {
            rejectArchived(requireAsset(link.mediaAssetId(), scope));
        }
        media.setLinkStatus(linkId, status, scope);
        audit(actor, "media.link_status_changed", linkId, Map.of("status", status.name()), scope);
        return requireLink(linkId, scope);
    }

    /**
     * Puts a hotel or room photo on the website as soon as Admin attaches it (owner decision
     * 2026-11-08): alt text the image lacks is filled in from the hotel or room name and the
     * gallery group (both locales, doc 62 §5 still holds), then the asset and the link are
     * published. An image with no bytes yet (an unfinished upload) is left as a draft.
     */
    @Transactional
    public MediaLink publishForWebsite(UUID linkId, ResolvedActor actor, AuthorizationScope scope) {
        MediaLink link = requireLink(linkId, scope);
        MediaAsset asset = requireAsset(link.mediaAssetId(), scope);
        if (asset.status() == MediaStatus.ARCHIVED || !media.hasContent(asset.id(), scope)) {
            return link;
        }
        for (String locale : List.of("vi", "en")) {
            if (!media.hasAltText(asset.id(), locale, scope)) {
                describe(asset.id(), locale, defaultAltText(link, asset.category(), locale, scope), null, actor, scope);
            }
        }
        if (asset.status() != MediaStatus.PUBLISHED) {
            publishAsset(asset.id(), actor, scope);
        }
        if (link.status() != MediaStatus.PUBLISHED) {
            setLinkStatus(link.id(), MediaStatus.PUBLISHED, actor, scope);
        }
        return requireLink(linkId, scope);
    }

    private String defaultAltText(MediaLink link, String category, String locale, AuthorizationScope scope) {
        String owner = media.ownerName(link.ownerType(), link.ownerId(), locale, scope)
                .or(() -> media.ownerName(link.ownerType(), link.ownerId(), "vi".equals(locale) ? "en" : "vi", scope))
                .orElse("KAS");
        return owner + " – " + categoryLabel(category, locale);
    }

    static String categoryLabel(String category, String locale) {
        boolean vi = "vi".equals(locale);
        return switch (category == null ? "" : category) {
            case "ROOM" -> vi ? "Phòng nghỉ" : "Room";
            case "LOBBY" -> vi ? "Sảnh & lễ tân" : "Lobby";
            case "DINING" -> vi ? "Ẩm thực" : "Dining";
            case "FACILITY" -> vi ? "Tiện ích" : "Facilities";
            case "ROOFTOP" -> vi ? "Sân thượng" : "Rooftop";
            case "EXTERIOR" -> vi ? "Ngoại thất" : "Exterior";
            default -> vi ? "Hình ảnh" : "Photo";
        };
    }

    private void audit(ResolvedActor actor, String action, UUID entityId,
                       Map<String, Object> after, AuthorizationScope scope) {
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), action, ENTITY, entityId,
                null, after, null, null, null, CorrelationId.current(), scope.toString()));
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) {
            return UserRole.SUPER_ADMIN.name();
        }
        if (actor.roles().contains(UserRole.ADMIN)) {
            return UserRole.ADMIN.name();
        }
        return UserRole.CUSTOMER.name();
    }
}
