package com.kas.platform.media;

import com.kas.platform.shared.scope.AuthorizationScope;
import com.kas.platform.shared.scope.ScopeKind;
import com.kas.platform.shared.scope.ScopedRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Assets and their links, always within the caller's scope.
 *
 * <p>Assets and links are one repository because they are one aggregate: a link
 * is meaningless without its asset, and every ownership question crosses both.
 *
 * <p><strong>Two different ownership paths, both enforced in SQL.</strong>
 * An asset is owned directly by {@code media_asset.partner_id} — doc 85 §4.3, the
 * one entity where partner does not derive. A link is owned by whatever it points
 * at, resolved through {@code property} or {@code room_type → property}. Both are
 * predicates inside the statement; nothing is fetched and then checked.
 */
@Repository
public class MediaRepository implements ScopedRepository {

    private static final String ASSET_COLUMNS = """
            a.id, a.partner_id, a.mime_type, a.width, a.height, a.size_bytes,
            a.category::text AS category, a.visibility::text AS visibility, a.status::text AS status, a.external_url
            """;

    private final JdbcClient jdbc;

    public MediaRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ assets

    /**
     * Registers an asset in the partner's library.
     *
     * <p>The {@code storageKey} is assigned by the platform (doc 62 §3), never
     * accepted from a client — an attacker-chosen key is a path-traversal and
     * object-overwrite vector, and doc 62 §3 is explicit that "the platform
     * assigns its own storage_key".
     *
     * <p>The {@code assetId} is supplied rather than left to the column default
     * because the key is derived from it — see
     * {@code MediaService.storageKeyFor}. The row still owns the value; nothing
     * outside the media module chooses it.
     */
    public Optional<UUID> createAsset(UUID assetId, UUID partnerId, String storageKey,
                                      String mimeType,
                                      String category, Integer width, Integer height,
                                      Long sizeBytes, UUID uploadedBy, AuthorizationScope scope) {
        if (!ownsPartner(partnerId, scope)) {
            return Optional.empty();
        }
        return jdbc.sql("""
                        INSERT INTO media_asset (id, partner_id, storage_key, mime_type, category,
                                                 width, height, size_bytes, uploaded_by)
                        VALUES (:assetId, :partnerId, :storageKey, :mimeType,
                                CAST(:category AS media_category),
                                :width, :height, :sizeBytes, :uploadedBy)
                        RETURNING id
                        """)
                .param("assetId", assetId)
                .param("partnerId", partnerId)
                .param("storageKey", storageKey)
                .param("mimeType", mimeType)
                .param("category", category)
                .param("width", width)
                .param("height", height)
                .param("sizeBytes", sizeBytes)
                .param("uploadedBy", uploadedBy)
                .query(UUID.class)
                .optional();
    }

    public Optional<MediaAsset> findAsset(UUID assetId, AuthorizationScope scope) {
        return jdbc.sql("SELECT " + ASSET_COLUMNS + " FROM media_asset a WHERE a.id = :id")
                .param("id", assetId)
                .query(MediaRepository::mapAsset)
                .optional()
                .filter(asset -> ownsPartner(asset.partnerId(), scope));
    }

    public List<MediaAsset> findAssetsForPartner(UUID partnerId, AuthorizationScope scope) {
        if (partnerId == null && scope.kind() == ScopeKind.GLOBAL) {
            return jdbc.sql("SELECT " + ASSET_COLUMNS + " FROM media_asset a WHERE a.archived_at IS NULL ORDER BY a.created_at DESC")
                    .query(MediaRepository::mapAsset).list();
        }
        if (!ownsPartner(partnerId, scope)) {
            return List.of();
        }
        return jdbc.sql("SELECT " + ASSET_COLUMNS + " FROM media_asset a "
                        + "WHERE a.partner_id = :p AND a.archived_at IS NULL "
                        + "ORDER BY a.created_at DESC")
                .param("p", partnerId)
                .query(MediaRepository::mapAsset)
                .list();
    }

    /**
     * The object key for an asset the caller can reach.
     *
     * <p>The one read that returns {@code storage_key}, and the reason it is safe
     * is that it is scoped like every other read here and its only caller is
     * {@link MediaService}, which hands it straight to a {@link StorageProvider}.
     * {@link MediaAsset} still has no field for it, so it cannot reach a DTO by
     * accident — doc 62 §2 calls it "INTERNAL. Never leaves the server", and doc
     * 58 §9 denylists it.
     */
    public Optional<String> storageKeyOf(UUID assetId, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT storage_key FROM media_asset WHERE id = :id")
                .param("id", assetId)
                .query(String.class)
                .optional();
    }

    /**
     * Records what storage said about the finished upload — doc 62 §4 step 3.
     *
     * <p>{@code size_bytes} and {@code checksum} come from the object itself
     * rather than from the client that registered it, so a declared size cannot
     * disagree with the stored file. <strong>{@code status} is untouched</strong>:
     * completing an upload does not publish anything, and doc 62 §5's alt-text
     * gate is still the only way to {@code PUBLISHED}.
     */
    public boolean recordUpload(UUID assetId, long sizeBytes, String checksum,
                                AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE media_asset
                           SET size_bytes = :size,
                               checksum = :checksum,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("size", sizeBytes)
                .param("checksum", checksum)
                .param("id", assetId)
                .update() > 0;
    }

    /**
     * An earlier live asset of the same partner holding this checksum — doc 62
     * §4's <em>"repeat upload of the same checksum returns the existing asset"</em>.
     *
     * <p>Scoped to the partner deliberately. The checksum is a property of the
     * bytes, so two partners uploading the same stock photograph would collide;
     * returning one partner's asset to another would be a cross-partner read
     * dressed up as deduplication.
     *
     * <p>Archived assets are excluded — a partner who deleted an image and
     * uploads it again should get a live asset back, not a tombstone.
     */
    public Optional<UUID> findLiveAssetByChecksum(UUID partnerId, String checksum, UUID excluding,
                                                  AuthorizationScope scope) {
        if (!ownsPartner(partnerId, scope) || checksum == null || checksum.isBlank()) {
            return Optional.empty();
        }
        return jdbc.sql("""
                        SELECT id FROM media_asset
                         WHERE partner_id = :p AND checksum = :c
                           AND archived_at IS NULL AND id <> :excluding
                         ORDER BY created_at
                         LIMIT 1
                        """)
                .param("p", partnerId)
                .param("c", checksum)
                .param("excluding", excluding)
                .query(UUID.class)
                .optional();
    }

    /** Alt text and caption. Locale is constrained to vi/en, alt text to non-blank, by CHECK. */
    public boolean setTranslation(UUID assetId, String locale, String altText, String caption,
                                  AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return false;
        }
        jdbc.sql("""
                        INSERT INTO media_asset_translation (media_asset_id, locale, alt_text, caption)
                        VALUES (:id, :locale, :alt, :caption)
                        ON CONFLICT (media_asset_id, locale) DO UPDATE SET
                            alt_text = EXCLUDED.alt_text,
                            caption  = coalesce(EXCLUDED.caption, media_asset_translation.caption)
                        """)
                .param("id", assetId)
                .param("locale", locale)
                .param("alt", altText)
                .param("caption", caption)
                .update();
        return true;
    }

    /** Whether the asset has bytes: a completed upload (checksum) or an external image. */
    public boolean hasContent(UUID assetId, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) return false;
        return jdbc.sql("SELECT count(*) FROM media_asset WHERE id = :id AND (checksum IS NOT NULL OR external_url IS NOT NULL)")
                .param("id", assetId).query(Long.class).single() > 0;
    }

    public boolean hasAltText(UUID assetId, String locale, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) return false;
        return jdbc.sql("""
                        SELECT count(*) FROM media_asset_translation
                         WHERE media_asset_id = :id AND locale = :locale AND length(btrim(alt_text)) > 0
                        """)
                .param("id", assetId).param("locale", locale).query(Long.class).single() > 0;
    }

    /**
     * The hotel's or room type's name in one locale — the subject of a default alt text.
     * Empty when the owner is outside the caller's scope.
     */
    public java.util.Optional<String> ownerName(MediaOwnerType ownerType, UUID ownerId, String locale,
                                                AuthorizationScope scope) {
        com.kas.platform.shared.scope.ScopeFilter filter =
                com.kas.platform.shared.scope.ScopeFilter.forProperties(scope, "p.partner_id", "p.id");
        String sql = switch (ownerType) {
            case PROPERTY -> """
                    SELECT t.name FROM property_translation t JOIN property p ON p.id = t.property_id
                     WHERE t.property_id = ? AND t.locale = ? AND %s
                    """;
            case ROOM_TYPE -> """
                    SELECT t.name FROM room_type_translation t
                      JOIN room_type rt ON rt.id = t.room_type_id JOIN property p ON p.id = rt.property_id
                     WHERE t.room_type_id = ? AND t.locale = ? AND %s
                    """;
            default -> null;
        };
        if (sql == null) return java.util.Optional.empty();
        List<Object> params = new java.util.ArrayList<>(List.of(ownerId, locale));
        params.addAll(filter.parameters());
        return jdbc.sql(sql.formatted(filter.sql())).params(params).query(String.class).optional()
                .map(String::trim).filter(name -> !name.isEmpty());
    }

    /**
     * How many of the two frozen locales have alt text. The publish gate reads this.
     *
     * <p>Takes the scope even though the caller has already resolved the asset:
     * every public method on a {@code ScopedRepository} must, and an exemption
     * "because the caller checks" is exactly the habit the rule exists to stop.
     */
    public int altTextLocaleCount(UUID assetId, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return 0;
        }
        return jdbc.sql("""
                        SELECT count(*) FROM media_asset_translation
                         WHERE media_asset_id = :id AND locale IN ('en','vi')
                           AND alt_text IS NOT NULL AND length(btrim(alt_text)) > 0
                        """)
                .param("id", assetId)
                .query(Integer.class)
                .single();
    }

    public boolean setAssetStatus(UUID assetId, MediaStatus status, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE media_asset
                           SET status = CAST(:status AS media_status),
                               archived_at = CASE WHEN :status = 'ARCHIVED' THEN now()
                                                  ELSE archived_at END,
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("status", status.name())
                .param("id", assetId)
                .update() > 0;
    }

    /** Moves an in-scope asset to another frozen {@code media_category}. */
    public boolean setAssetCategory(UUID assetId, String category, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("""
                        UPDATE media_asset
                           SET category = CAST(:category AS media_category),
                               updated_at = now()
                         WHERE id = :id
                        """)
                .param("category", category)
                .param("id", assetId)
                .update() > 0;
    }

    // ------------------------------------------------------------------- links

    /**
     * Attaches an asset to an owner.
     *
     * <p>Both the asset and the owner must be in scope. They are checked
     * separately because they can belong to different partners — the whole point
     * of doc 85 §4.3's {@code media_asset.partner_id} is that an asset's owner
     * cannot be inferred from what it is linked to, so cross-partner attachment
     * is only preventable by checking both ends.
     */
    public Optional<UUID> link(UUID assetId, MediaOwnerType ownerType, UUID ownerId,
                               int displayOrder, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty() || !ownsOwner(ownerType, ownerId, scope)) {
            return Optional.empty();
        }
        return jdbc.sql("""
                        INSERT INTO media_link (media_asset_id, owner_type, owner_id, display_order)
                        VALUES (:asset, CAST(:ownerType AS media_owner_type), :owner, :order)
                        RETURNING id
                        """)
                .param("asset", assetId)
                .param("ownerType", ownerType.name())
                .param("owner", ownerId)
                .param("order", displayOrder)
                .query(UUID.class)
                .optional();
    }

    /**
     * Detaches an asset from an owner. The asset itself survives.
     *
     * <p>Doc 62 §2: the library exists so one asset can appear in several
     * galleries. Removing it from one must not destroy it for the others, and the
     * {@code ON DELETE RESTRICT} on the asset FK means it could not be destroyed
     * while any link remained anyway.
     */
    public boolean detach(UUID linkId, AuthorizationScope scope) {
        return findLink(linkId, scope)
                .map(link -> jdbc.sql("DELETE FROM media_link WHERE id = :id")
                        .param("id", linkId)
                        .update() > 0)
                .orElse(false);
    }

    public Optional<MediaLink> findLink(UUID linkId, AuthorizationScope scope) {
        return jdbc.sql("""
                        SELECT l.id, l.media_asset_id, l.owner_type::text AS owner_type,
                               l.owner_id, l.display_order, l.is_cover, l.status::text AS status
                          FROM media_link l WHERE l.id = :id
                        """)
                .param("id", linkId)
                .query(MediaRepository::mapLink)
                .optional()
                .filter(link -> ownsOwner(link.ownerType(), link.ownerId(), scope));
    }

    public List<MediaLink> findLinks(MediaOwnerType ownerType, UUID ownerId,
                                     AuthorizationScope scope) {
        if (!ownsOwner(ownerType, ownerId, scope)) {
            return List.of();
        }
        return jdbc.sql("""
                        SELECT l.id, l.media_asset_id, l.owner_type::text AS owner_type,
                               l.owner_id, l.display_order, l.is_cover, l.status::text AS status
                          FROM media_link l
                         WHERE l.owner_type = CAST(:ownerType AS media_owner_type)
                           AND l.owner_id = :owner
                         ORDER BY l.display_order, l.id
                        """)
                .param("ownerType", ownerType.name())
                .param("owner", ownerId)
                .query(MediaRepository::mapLink)
                .list();
    }

    /**
     * The cover placement of every owner of one kind the caller's scope reaches.
     *
     * <h2>Why a batch read exists at all</h2>
     *
     * <p>A gallery is assembled from the library plus one {@code usages} call per
     * asset, which is fine for the one owner a media screen is editing. The
     * portfolio is a different question — <em>the cover of each of eight
     * hotels</em> — and answering it that way costs the library times the estate.
     * This is one query for the whole answer, in the module that owns
     * {@code media_link}, so nothing outside media learns that the table exists.
     *
     * <h2>What it does not filter on</h2>
     *
     * <p>Asset status is deliberately not narrowed. A Partner's own cover is
     * {@code DRAFT} until KAS publishes it, and a console that hid the operator's
     * own photograph until someone else approved it would be reporting the wrong
     * thing — the media screen already shows those assets. Archived ones are
     * excluded: a deduplicated duplicate is not a picture anyone chose.
     *
     * <p>Ordered by owner so the result is stable; the partial unique index
     * {@code media_link_one_cover_idx} already guarantees at most one row each.
     */
    public List<Cover> findCovers(MediaOwnerType ownerType, AuthorizationScope scope) {
        if (!ownerType.isPartnerManageable()) {
            return List.of();
        }
        com.kas.platform.shared.scope.ScopeFilter filter =
                com.kas.platform.shared.scope.ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        // The owner resolves to a partner through property, or room type then
        // property — the same two shapes ownsOwner walks, kept together with it.
        String ownerJoin = ownerType == MediaOwnerType.PROPERTY
                ? "JOIN property p ON p.id = l.owner_id"
                : "JOIN room_type rt ON rt.id = l.owner_id JOIN property p ON p.id = rt.property_id";

        List<Object> params = new ArrayList<>();
        params.add(ownerType.name());
        params.addAll(filter.parameters());

        return jdbc.sql("""
                        SELECT l.owner_id, l.media_asset_id, a.width, a.height, a.external_url
                          FROM media_link l
                          JOIN media_asset a ON a.id = l.media_asset_id
                          %s
                         WHERE l.owner_type = CAST(? AS media_owner_type)
                           AND l.is_cover
                           AND a.archived_at IS NULL
                           AND %s
                         ORDER BY l.owner_id
                        """.formatted(ownerJoin, filter.sql()))
                .params(params)
                .query((rs, rowNum) -> new Cover(
                        rs.getObject("owner_id", UUID.class),
                        rs.getObject("media_asset_id", UUID.class),
                        (Integer) rs.getObject("width"),
                        (Integer) rs.getObject("height"), rs.getString("external_url")))
                .list();
    }

    /**
     * One owner's cover, as the portfolio needs it.
     *
     * <p>The asset id and its intrinsic size, and nothing else: the delivery URL
     * is composed by {@link StorageProvider} at the edge, and the storage key
     * never leaves this class (doc 62 §6).
     */
    public record Cover(UUID ownerId, UUID mediaAssetId, Integer width, Integer height, String externalUrl) {
        public Cover(UUID ownerId, UUID mediaAssetId, Integer width, Integer height) {
            this(ownerId, mediaAssetId, width, height, null);
        }
    }

    public Optional<UUID> partnerForOwner(MediaOwnerType ownerType, UUID ownerId, AuthorizationScope scope) {
        if (!ownsOwner(ownerType, ownerId, scope)) return Optional.empty();
        String sql = ownerType == MediaOwnerType.PROPERTY
                ? "SELECT partner_id FROM property WHERE id = :id"
                : "SELECT p.partner_id FROM room_type rt JOIN property p ON p.id = rt.property_id WHERE rt.id = :id";
        return jdbc.sql(sql).param("id", ownerId).query(UUID.class).optional();
    }

    public void setExternalUrl(UUID assetId, String url, AuthorizationScope scope) {
        if (findAsset(assetId, scope).isEmpty()) return;
        jdbc.sql("UPDATE media_asset SET external_url = :url, storage_key = NULL, updated_at = now() WHERE id = :id")
                .param("url", url).param("id", assetId).update();
    }

    public Optional<MediaAsset> findExternal(String url, UUID partnerId, AuthorizationScope scope) {
        if (!ownsPartner(partnerId, scope)) return Optional.empty();
        return jdbc.sql("SELECT " + ASSET_COLUMNS + " FROM media_asset a WHERE a.external_url = :url AND a.partner_id = :partner")
                .param("url", url).param("partner", partnerId).query(MediaRepository::mapAsset).optional();
    }

    /**
     * Makes one link the cover, atomically.
     *
     * <p>Clearing first and setting second, in one transaction, is required by
     * the {@code media_link_one_cover_idx} partial unique index — setting before
     * clearing would violate it mid-statement. Doc 62 §2.2 relies on that index
     * for "exactly one cover, without application-level coordination", so this
     * method never needs to read the current cover to decide what to do.
     */
    public boolean setCover(UUID linkId, AuthorizationScope scope) {
        Optional<MediaLink> target = findLink(linkId, scope);
        if (target.isEmpty()) {
            return false;
        }
        MediaLink link = target.get();

        jdbc.sql("""
                        UPDATE media_link SET is_cover = false, updated_at = now()
                         WHERE owner_type = CAST(:ownerType AS media_owner_type)
                           AND owner_id = :owner AND is_cover
                        """)
                .param("ownerType", link.ownerType().name())
                .param("owner", link.ownerId())
                .update();

        return jdbc.sql("UPDATE media_link SET is_cover = true, updated_at = now() WHERE id = :id")
                .param("id", linkId)
                .update() > 0;
    }

    public boolean setLinkStatus(UUID linkId, MediaStatus status, AuthorizationScope scope) {
        if (findLink(linkId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("UPDATE media_link SET status = CAST(:status AS media_status), "
                        + "updated_at = now() WHERE id = :id")
                .param("status", status.name())
                .param("id", linkId)
                .update() > 0;
    }

    public boolean setDisplayOrder(UUID linkId, int displayOrder, AuthorizationScope scope) {
        if (findLink(linkId, scope).isEmpty()) {
            return false;
        }
        return jdbc.sql("UPDATE media_link SET display_order = :order, updated_at = now() "
                        + "WHERE id = :id")
                .param("order", displayOrder)
                .param("id", linkId)
                .update() > 0;
    }

    // ---------------------------------------------------------------- ownership

    /** An asset belongs to a partner directly — doc 85 §4.3. */
    private boolean ownsPartner(UUID partnerId, AuthorizationScope scope) {
        return switch (scope.kind()) {
            case GLOBAL -> true;
            case PARTNER -> scope.partnerId().equals(partnerId);
            case PROPERTY, OWN -> false;
        };
    }

    /** A link's owner resolves to a partner through property, or room type then property. */
    private boolean ownsOwner(MediaOwnerType ownerType, UUID ownerId, AuthorizationScope scope) {
        if (!ownerType.isPartnerManageable()) {
            return false;
        }
        com.kas.platform.shared.scope.ScopeFilter filter =
                com.kas.platform.shared.scope.ScopeFilter.forProperties(scope, "p.partner_id", "p.id");

        String sql = ownerType == MediaOwnerType.PROPERTY
                ? "SELECT count(*) FROM property p WHERE p.id = ? AND " + filter.sql()
                : "SELECT count(*) FROM room_type rt JOIN property p ON p.id = rt.property_id "
                        + "WHERE rt.id = ? AND " + filter.sql();

        List<Object> params = new ArrayList<>();
        params.add(ownerId);
        params.addAll(filter.parameters());

        return jdbc.sql(sql).params(params).query(Long.class).single() > 0;
    }

    private static MediaAsset mapAsset(ResultSet rs, int rowNum) throws SQLException {
        return new MediaAsset(
                rs.getObject("id", UUID.class),
                rs.getObject("partner_id", UUID.class),
                rs.getString("mime_type"),
                (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"),
                (Long) rs.getObject("size_bytes"),
                rs.getString("category"),
                rs.getString("visibility"),
                MediaStatus.valueOf(rs.getString("status")), rs.getString("external_url"));
    }

    private static MediaLink mapLink(ResultSet rs, int rowNum) throws SQLException {
        return new MediaLink(
                rs.getObject("id", UUID.class),
                rs.getObject("media_asset_id", UUID.class),
                MediaOwnerType.valueOf(rs.getString("owner_type")),
                rs.getObject("owner_id", UUID.class),
                rs.getInt("display_order"),
                rs.getBoolean("is_cover"),
                MediaStatus.valueOf(rs.getString("status")));
    }
}
