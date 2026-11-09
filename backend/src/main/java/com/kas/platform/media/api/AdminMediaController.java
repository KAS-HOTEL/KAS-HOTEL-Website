package com.kas.platform.media.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.media.MediaOwnerType;
import com.kas.platform.media.MediaService;
import com.kas.platform.media.MediaStatus;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.scope.AuthorizationScope;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The central media library — doc 58 §8: {@code /admin/media},
 * {@code /upload-url}, {@code /{id}/links}, {@code /{id}/usages}, with
 * {@code media.upload} and {@code media.publish}.
 *
 * <p>Both permissions already exist in doc 59 §4.5. Nothing was invented, and
 * they are used for what they say: {@code media.upload} covers registering,
 * describing, attaching and arranging; <strong>{@code media.publish} is required
 * to make an asset publishable</strong>, which is the act that can put an image
 * in front of a guest.
 *
 * <p>{@code POST /admin/media/upload-url} is implemented below using the
 * configured {@link com.kas.platform.media.StorageProvider}. It returns
 * {@code CONFIG_MISSING} when object storage has not been configured; see the
 * deployment settings for the R2 provider.
 */
@RestController
@RequestMapping("/api/v1/admin/media")
public class AdminMediaController {

    private final MediaService media;
    private final com.kas.platform.media.StorageProvider storage;

    private final String siteBase;

    public AdminMediaController(MediaService media, com.kas.platform.media.StorageProvider storage,
            @org.springframework.beans.factory.annotation.Value("${kas.auth.customer-site-base-url:http://127.0.0.1:3010}") String siteBase) {
        this.media = media;
        this.storage = storage;
        this.siteBase = siteBase.replaceAll("/+$", "");
    }

    /**
     * Images shipped with the website (`/img/…`, V60) live on the website host, not on the
     * console host, so the console is given the full website address for them.
     */
    private String siteUrl(String reference) {
        return reference != null && reference.startsWith("/img/") ? siteBase + reference : reference;
    }

    /** The partner's library. Scope decides whose. */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public List<MediaAssetView> library() {
        AuthorizationScope scope = CurrentActor.requireScope();
        return media.library(scope.partnerId(), scope).stream()
                .map(asset -> MediaAssetView.of(storage, this::siteUrl, asset))
                .toList();
    }

    /**
     * The cover of every property, or of every room type, the caller can reach.
     *
     * <h2>Why this route exists</h2>
     *
     * <p>A gallery is assembled from the library plus one {@code usages} call per
     * asset, which is the right shape for the one owner a media screen edits. The
     * portfolio asks a different question — <em>the cover of each hotel</em> —
     * and answering it that way costs the library times the estate. This is one
     * request and one query.
     *
     * <p>It is <strong>not</strong> a second media model. The cover is still
     * {@code media_link.is_cover}, the URL is still composed from the opaque
     * asset id, and nothing here can be written: the acts that set a cover remain
     * {@code PATCH /{assetId}/links/{linkId}/cover} and nothing else.
     *
     * <p>Deliberately kept out of {@code PropertyAdminView}: {@code onboarding}
     * does not depend on {@code media} and must not start to — a portfolio row
     * carrying a media field would drag the whole module graph across a boundary
     * doc 12 §3 draws, to save one request.
     *
     * <p>{@code ownerType} is the query parameter rather than the path so the
     * route reads as one question with two subjects. Only the two owner kinds a
     * Partner manages are accepted; the rest of the frozen enum has no
     * Partner-facing surface and would return links this module cannot scope.
     */
    @GetMapping("/covers")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public List<MediaCoverView> covers(@RequestParam AttachMediaRequest.OwnerType ownerType) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return media.covers(MediaOwnerType.valueOf(ownerType.name()), scope).stream()
                .map(cover -> MediaCoverView.of(storage, this::siteUrl, cover))
                .toList();
    }

    @GetMapping("/{assetId}")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaAssetView get(@PathVariable UUID assetId) {
        return MediaAssetView.of(storage, this::siteUrl, media.requireAsset(assetId, CurrentActor.requireScope()));
    }

    /**
     * Registers an asset. The partner comes from scope; the storage key from the
     * platform.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public MediaAssetView register(@Valid @RequestBody RegisterMediaRequest request) {
        AuthorizationScope scope = CurrentActor.requireScope();
        return MediaAssetView.of(storage, this::siteUrl, media.registerAsset(requirePartner(scope), request.mimeType(),
                request.category(), request.width(), request.height(), request.sizeBytes(),
                CurrentActor.require().actor(), scope));
    }

    @PostMapping("/external")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "') and hasAuthority('" + Permissions.MEDIA_PUBLISH + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public MediaAssetView external(@Valid @RequestBody ExternalMediaRequest request) {
        return MediaAssetView.of(storage, this::siteUrl, media.addExternal(request.url(), request.mimeType(), request.category(),
                MediaOwnerType.valueOf(request.ownerType().name()), request.ownerId(), request.displayOrder(),
                request.altTextVi(), request.altTextEn(), CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /**
     * Doc 62 §4 step 1 — {@code POST /admin/media/upload-url}, doc 58 §8,
     * permission {@code media.upload}.
     *
     * <p>Registers the asset and returns a short-lived URL the browser
     * {@code PUT}s the bytes to. <strong>The bytes never reach this server</strong>
     * — doc 62 §4: <em>"the application server never proxies image bytes"</em>.
     *
     * <p>The body is {@link RegisterMediaRequest}, unchanged, so there is one
     * description of an asset rather than two. It still has no {@code storageKey}
     * field: the platform assigns the key (doc 62 §3) and the signature binds it,
     * so a client can neither choose where its object lands nor aim a minted URL
     * at somebody else's.
     *
     * <p><strong>Not a second upload endpoint.</strong> {@code POST /admin/media}
     * remains the way to register an asset whose bytes arrive by another route —
     * the doc 62 §3 folder import — and this is the browser path.
     *
     * <p>Refusals: {@code 400} for a type outside the allowlist, {@code 404} when
     * the caller has no partner scope, and {@code CONFIG_MISSING} when the
     * deployment has no object storage, which is a misconfiguration rather than a
     * client error.
     */
    @PostMapping("/upload-url")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public UploadUrlView uploadUrl(@Valid @RequestBody RegisterMediaRequest request,
                                   @RequestParam(required = false) AttachMediaRequest.OwnerType ownerType,
                                   @RequestParam(required = false) UUID ownerId) {
        AuthorizationScope scope = CurrentActor.requireScope();
        UUID partnerId = ownerType != null && ownerId != null
                ? media.partnerForOwner(MediaOwnerType.valueOf(ownerType.name()), ownerId, scope) : requirePartner(scope);
        return UploadUrlView.of(media.beginUpload(partnerId, request.mimeType(),
                request.category(), request.width(), request.height(), request.sizeBytes(),
                CurrentActor.require().actor(), scope));
    }

    /**
     * Doc 62 §4 step 3 — {@code POST /admin/media/{id}/complete}, permission
     * {@code media.upload}.
     *
     * <p>Confirms the upload: the object must exist, its content type must match
     * what the asset was registered as, and its first bytes must actually be that
     * type. Size and checksum are then recorded from storage rather than from the
     * client.
     *
     * <p>Repeating an upload of identical bytes returns the <strong>existing</strong>
     * asset (doc 62 §4), so a caller can retry without accumulating copies.
     *
     * <p><strong>This does not publish anything.</strong> The asset stays
     * {@code DRAFT} and doc 62 §5's alt-text gate is unchanged.
     *
     * <p>Refusals: {@code 404} out of scope, {@code 400} when nothing was
     * uploaded or the file is not what it claims to be.
     */
    @PostMapping("/{assetId}/complete")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaAssetView complete(@PathVariable UUID assetId) {
        return MediaAssetView.of(storage, this::siteUrl, media.completeUpload(assetId,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Alt text and caption for one locale. */
    @PatchMapping("/{assetId}/translations")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaAssetView describe(@PathVariable UUID assetId,
                                   @Valid @RequestBody MediaTranslationRequest request) {
        return MediaAssetView.of(storage, this::siteUrl, media.describe(assetId, request.locale(), request.altText(),
                request.caption(), CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Files the image under another gallery category (one of the frozen {@code media_category}). */
    @PatchMapping("/{assetId}/category")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaAssetView recategorize(@PathVariable UUID assetId,
                                       @Valid @RequestBody CategoryRequest request) {
        return MediaAssetView.of(storage, this::siteUrl, media.recategorize(assetId, request.category(),
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    public record CategoryRequest(
            @jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Pattern(
                    regexp = "EXTERIOR|LOBBY|ROOM|DINING|FACILITY|ROOFTOP|NEIGHBOURHOOD|DETAIL|STAFF|EVENT|DOCUMENT",
                    message = "must be a frozen media category")
            String category) {
    }

    /**
     * Publishes an asset. Requires {@code media.publish} and alt text in both
     * locales — doc 62 §5.
     */
    @PostMapping("/{assetId}/publish")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_PUBLISH + "')")
    public MediaAssetView publish(@PathVariable UUID assetId) {
        return MediaAssetView.of(storage, this::siteUrl, media.publishAsset(assetId,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    // ------------------------------------------------------------------- links

    /** Doc 58 §8 — where this asset is used. */
    @GetMapping("/{assetId}/usages")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public List<MediaLinkView> usages(@PathVariable UUID assetId,
                                      @RequestParam MediaOwnerType ownerType,
                                      @RequestParam UUID ownerId) {
        return media.links(ownerType, ownerId, CurrentActor.requireScope()).stream()
                .filter(link -> link.mediaAssetId().equals(assetId))
                .map(MediaLinkView::of)
                .toList();
    }

    @PostMapping("/{assetId}/links")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public MediaLinkView attach(@PathVariable UUID assetId,
                                @Valid @RequestBody AttachMediaRequest request) {
        var principal = CurrentActor.require();
        var link = media.attach(assetId,
                MediaOwnerType.valueOf(request.ownerType().name()), request.ownerId(),
                request.displayOrderOrDefault(), principal.actor(), CurrentActor.requireScope());
        // Owner decision 2026-11-08: a photo Admin attaches goes on the website straight away.
        // Only for a caller who may publish (media.publish); anyone else leaves a draft.
        if (principal.permissions().contains(Permissions.MEDIA_PUBLISH)) {
            link = media.publishForWebsite(link.id(), principal.actor(), CurrentActor.requireScope());
        }
        return MediaLinkView.of(link);
    }

    /** Detaches without destroying the asset — doc 62 §2. */
    @DeleteMapping("/{assetId}/links/{linkId}")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public ResponseEntity<Void> detach(@PathVariable UUID assetId, @PathVariable UUID linkId) {
        media.detach(linkId, CurrentActor.require().actor(), CurrentActor.requireScope());
        return ResponseEntity.noContent().build();
    }

    /** Makes this attachment the owner's cover. Any previous cover is cleared. */
    @PatchMapping("/{assetId}/links/{linkId}/cover")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaLinkView setCover(@PathVariable UUID assetId, @PathVariable UUID linkId) {
        return MediaLinkView.of(media.setCover(linkId,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    @PatchMapping("/{assetId}/links/{linkId}/order")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_UPLOAD + "')")
    public MediaLinkView reorder(@PathVariable UUID assetId, @PathVariable UUID linkId,
                                 @RequestParam int displayOrder) {
        return MediaLinkView.of(media.reorder(linkId, displayOrder,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /** Publishing the attachment. The asset and the owner must also be published. */
    @PatchMapping("/{assetId}/links/{linkId}/status")
    @PreAuthorize("hasAuthority('" + Permissions.MEDIA_PUBLISH + "')")
    public MediaLinkView setLinkStatus(@PathVariable UUID assetId, @PathVariable UUID linkId,
                                       @RequestParam MediaStatus status) {
        return MediaLinkView.of(media.setLinkStatus(linkId, status,
                CurrentActor.require().actor(), CurrentActor.requireScope()));
    }

    /**
     * The library belongs to a partner, so a caller without one has none.
     * GLOBAL scope reaches every partner but implies no particular library.
     */
    private static UUID requirePartner(AuthorizationScope scope) {
        UUID partnerId = scope.partnerId();
        if (partnerId == null) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "Only a partner-scoped account can manage a media library.");
        }
        return partnerId;
    }
}
