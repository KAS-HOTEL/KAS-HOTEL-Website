package com.kas.platform.security.it;

import com.kas.platform.identity.UserRole;
import com.kas.platform.shared.scope.ScopeKind;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Synthetic fixtures for the Phase 7.4 security suite.
 *
 * <p>Everything created here is prefixed {@code TEST_} or {@code test-}, uses
 * random UUIDs, and is written inside the test's transaction — every test class
 * that uses this is {@code @Transactional}, so Spring rolls the whole lot back.
 * The same approach Phase 7.2 used for {@code invariants.sql}.
 *
 * <p>Passwords are hashed with the <strong>real</strong> {@link PasswordEncoder}
 * bean rather than a stub. A fixture that inserted a fake hash would let the
 * authentication tests pass without Argon2id ever running, which is precisely
 * what they exist to check.
 *
 * <p>No business data is invented: property rows carry synthetic slugs and
 * placeholder location values, and no rate, policy, room type or content is
 * created. These rows exist to be authorised against, not to describe hotels.
 */
@Component
public class SecurityFixtures {

    /** Doc 85 §1 — the V1 KAS partner runs eight properties. */
    public static final int V1_PROPERTY_COUNT = 8;

    private final JdbcClient jdbc;
    private final PasswordEncoder passwordEncoder;

    public SecurityFixtures(JdbcClient jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    public UUID createPartner(String code) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO partner (id, code, legal_name, display_name, status)
                        VALUES (:id, :code, :name, :name, 'ACTIVE')
                        """)
                .param("id", id)
                .param("code", "test-" + code + "-" + id.toString().substring(0, 8))
                .param("name", "TEST_PARTNER_" + code)
                .update();
        return id;
    }

    /**
     * Creates {@code count} properties owned by {@code partnerId}.
     *
     * <p>Each gets a branch code, because since V31 a property without one
     * cannot be booked: {@code ReservationReference} refuses with
     * {@code CONFIG_MISSING} rather than issuing a reference that cannot name
     * its hotel. A fixture that skipped it would make every reservation test
     * fail for a reason that has nothing to do with what it is testing.
     *
     * <p>Codes are per-partner, and a test may call this twice for one partner,
     * so numbering continues from the partner's existing properties to stay inside
     * the partial unique index on {@code (partner_id, branch_code)}. Two digits,
     * wrapping at 100 — no test creates that many properties for one partner.
     */
    public List<UUID> createProperties(UUID partnerId, int count) {
        List<UUID> ids = new ArrayList<>();
        int existing = jdbc.sql("SELECT count(*) FROM property WHERE partner_id = :partnerId")
                .param("partnerId", partnerId).query(Integer.class).single();
        for (int index = existing; index < existing + count; index++) {
            UUID id = UUID.randomUUID();
            jdbc.sql("""
                            INSERT INTO property
                                (id, partner_id, slug, lifecycle_state, is_flagship,
                                 city, country, sort_order, branch_code, version)
                            VALUES (:id, :partnerId, :slug, 'DRAFT', false,
                                    'TEST_CITY', 'VN', :sortOrder, :branchCode, 1)
                            """)
                    .param("id", id)
                    .param("partnerId", partnerId)
                    .param("slug", "test-property-" + id)
                    .param("sortOrder", index)
                    .param("branchCode", String.format("%02d", index % 100))
                    .update();
            ids.add(id);
        }
        return ids;
    }

    /** The property that owns a slug. */
    public UUID propertyIdOfSlug(String slug) {
        return jdbc.sql("SELECT id FROM property WHERE slug = :slug")
                .param("slug", slug)
                .query(UUID.class)
                .single();
    }

    /**
     * A reservation row inserted straight past the booking flow, to occupy a
     * reference.
     *
     * <p>Only what V12 makes NOT NULL plus the DIRECT CHECKs: the reference is
     * the subject here, not the booking. Used to prove the UNIQUE constraint
     * refuses a duplicate and to crowd a branch's reference space so the
     * generator's retry has to do real work.
     */
    public void insertRawReservation(UUID propertyId, String reference) {
        jdbc.sql("""
                        INSERT INTO reservation
                            (id, reference, property_id, distribution_channel_id, channel_type,
                             lead_source, sales_status, check_in, check_out, adults, children,
                             guest_name, currency)
                        SELECT :id, :reference, :propertyId, dc.id, 'DIRECT',
                               'WEBSITE', 'REQUESTED', :checkIn, :checkOut, 1, 0,
                               'Reference Fixture', 'VND'
                          FROM distribution_channel dc
                         WHERE dc.channel_type = 'DIRECT'
                         LIMIT 1
                        """)
                .param("id", UUID.randomUUID())
                .param("reference", reference)
                .param("propertyId", propertyId)
                .param("checkIn", java.sql.Date.valueOf(java.time.LocalDate.now().plusDays(200)))
                .param("checkOut", java.sql.Date.valueOf(java.time.LocalDate.now().plusDays(202)))
                .update();
    }

    /** Sets or clears a property's branch code, for the reference tests. */
    public void setBranchCode(UUID propertyId, String branchCode) {
        jdbc.sql("UPDATE property SET branch_code = :code WHERE id = :id")
                .param("code", branchCode)
                .param("id", propertyId)
                .update();
    }

    /** The branch code as stored — null when the property has none. */
    public String branchCodeOf(UUID propertyId) {
        return jdbc.sql("SELECT branch_code FROM property WHERE id = :id")
                .param("id", propertyId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /** An ACTIVE user with an Argon2id hash of {@code password}. */
    public UUID createUser(String emailLocalPart, String password) {
        return createUser(emailLocalPart, password, "ACTIVE");
    }

    public UUID createUser(String emailLocalPart, String password, String status) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                        INSERT INTO app_user
                            (id, email, password_hash, status, two_factor_enabled,
                             locale, failed_login_count, email_verified_at)
                        VALUES (:id, :email, :hash, CAST(:status AS user_status), false, 'en', 0, now())
                        """)
                .param("id", id)
                .param("email", emailLocalPart + "-" + id.toString().substring(0, 8) + "@test.invalid")
                .param("hash", passwordEncoder.encode(password))
                .param("status", status)
                .update();
        return id;
    }

    public String emailOf(UUID userId) {
        return jdbc.sql("SELECT email FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(String.class)
                .single();
    }

    public String passwordHashOf(UUID userId) {
        return jdbc.sql("SELECT password_hash FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(String.class)
                .single();
    }

    /** {@code ADMIN} + {@code PARTNER} scope — the V1 KAS Partner/Sales user, doc 85 §5.2. */
    public void grantPartnerScope(UUID userId, UUID partnerId) {
        jdbc.sql("""
                        INSERT INTO role_assignment (id, user_id, role, scope_kind, partner_id)
                        VALUES (:id, :userId, CAST(:role AS user_role),
                                CAST('PARTNER' AS scope_kind), :partnerId)
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("role", UserRole.ADMIN.name())
                .param("partnerId", partnerId)
                .update();
    }

    /**
     * Operations ({@code sales.*}, {@code reservation.*}, messaging) belong to
     * {@code SUPER_ADMIN} since the ADMIN bundle was narrowed in {@code RoleCatalogue}.
     * The PARTNER scope keeps the tenant isolation these suites exist to prove.
     */
    public void grantPartnerOperations(UUID userId, UUID partnerId) {
        jdbc.sql("""
                        INSERT INTO role_assignment (id, user_id, role, scope_kind, partner_id)
                        VALUES (:id, :userId, CAST(:role AS user_role),
                                CAST('PARTNER' AS scope_kind), :partnerId)
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("role", UserRole.SUPER_ADMIN.name())
                .param("partnerId", partnerId)
                .update();
    }

    /** False when the test database also carries the hotels used for manual website testing. */
    public boolean noPublishedSeedProperties() {
        return jdbc.sql("SELECT count(*) FROM property WHERE slug LIKE 'kas-%' AND lifecycle_state = 'OPEN'")
                .query(Long.class).single() == 0L;
    }

    /**
     * The state the manual flow reaches before a win: staff approved the request
     * (PAYMENT_PENDING) and recorded the verified transfer. Terminal states are left alone.
     */
    public void recordVerifiedPayment(String reference) {
        jdbc.sql("""
                        UPDATE reservation SET sales_status = 'PAYMENT_PENDING'
                         WHERE reference = :reference
                           AND sales_status IN ('AVAILABILITY_CHECK', 'CUSTOMER_CONTACTED')
                        """)
                .param("reference", reference)
                .update();
        jdbc.sql("""
                        INSERT INTO payment (reservation_id, method, amount_minor, currency, received_at, status, notes)
                        SELECT r.id, 'QR', r.total_minor, r.currency, now(), 'VERIFIED', 'test fixture'
                          FROM reservation r
                         WHERE r.reference = :reference
                           AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.reservation_id = r.id)
                        """)
                .param("reference", reference)
                .update();
    }

    public void grantGlobalScope(UUID userId, UserRole role) {
        jdbc.sql("""
                        INSERT INTO role_assignment (id, user_id, role, scope_kind)
                        VALUES (:id, :userId, CAST(:role AS user_role), CAST('GLOBAL' AS scope_kind))
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("role", role.name())
                .update();
    }

    /** Future property-scoped staff — no V1 role holds this, but the scope must work. */
    public void grantPropertyScope(UUID userId, UserRole role, List<UUID> propertyIds) {
        String array = propertyIds.stream()
                .map(UUID::toString)
                .collect(Collectors.joining(",", "{", "}"));
        jdbc.sql("""
                        INSERT INTO role_assignment (id, user_id, role, scope_kind, property_ids)
                        VALUES (:id, :userId, CAST(:role AS user_role),
                                CAST('PROPERTY' AS scope_kind), CAST(:ids AS uuid[]))
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("role", role.name())
                .param("ids", array)
                .update();
    }

    public void grantOwnScope(UUID userId) {
        jdbc.sql("""
                        INSERT INTO role_assignment (id, user_id, role, scope_kind)
                        VALUES (:id, :userId, CAST('CUSTOMER' AS user_role),
                                CAST('OWN' AS scope_kind))
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .update();
    }

    /**
     * Satisfies every doc 52 §3.1 publish requirement for a property.
     *
     * <p>Written directly rather than through endpoints because the room type,
     * media and experience APIs are Phase 7.5B+ and do not exist yet. The
     * <em>workflow</em> under test — submit, review, approve, publish — is still
     * exercised entirely over HTTP; only the content these steps operate on is
     * seeded here. Recorded as a limitation in doc 93.
     */
    public void makePropertyComplete(UUID propertyId, UUID partnerId) {
        makePropertyCompleteExceptCover(propertyId);
        addHeroImage(propertyId, partnerId);
    }

    /**
     * Every completeness section satisfied **except the cover photograph**.
     *
     * <p>The state a real property is actually in for most of its life, and the
     * one worth testing against: it is the photograph that opens the gate, and a
     * fixture that handed over a complete property could not show why.
     *
     * <p>{@link #makePropertyComplete} is this plus a hero image, so the two
     * cannot drift apart — a section added to the checker has one place to be
     * satisfied rather than two.
     */
    public void makePropertyCompleteExceptCover(UUID propertyId) {
        jdbc.sql("""
                        UPDATE property_translation
                           SET short_description = 'TEST_SHORT_DESCRIPTION',
                               signature_line    = 'TEST_SIGNATURE_LINE ' || :id
                         WHERE property_id = :id
                        """)
                .param("id", propertyId)
                .update();

        jdbc.sql("UPDATE property SET district = 'TEST_DISTRICT', ward = 'TEST_WARD' "
                        + "WHERE id = :id")
                .param("id", propertyId)
                .update();

        addRoomType(propertyId, "test-room-" + UUID.randomUUID().toString().substring(0, 8));
        addSignatureExperience(propertyId);
    }

    /**
     * Removes one locale of a room type's content.
     *
     * {@link #addRoomType} writes both frozen locales, which is the normal case.
     * A room type mid-authoring can have one or neither, and those states have to
     * be reachable in a test or the read surface is only ever exercised against
     * the easy one.
     */
    public void removeRoomTypeTranslation(UUID roomTypeId, String locale) {
        jdbc.sql("DELETE FROM room_type_translation WHERE room_type_id = :rt AND locale = :l")
                .param("rt", roomTypeId)
                .param("l", locale)
                .update();
    }

    public UUID addRoomType(UUID propertyId, String slug) {
        UUID id = jdbc.sql("""
                        INSERT INTO room_type (property_id, slug, max_adults, max_children, max_occupancy)
                        VALUES (:p, :slug, 2, 0, 2) RETURNING id
                        """)
                .param("p", propertyId)
                .param("slug", slug)
                .query(UUID.class)
                .single();

        jdbc.sql("INSERT INTO room_type_translation (room_type_id, locale, name) "
                        + "VALUES (:rt,'en','TEST_ROOM'), (:rt,'vi','TEST_ROOM')")
                .param("rt", id)
                .update();
        return id;
    }

    /**
     * A property with a hero image, as if one had genuinely been uploaded.
     *
     * <p>The {@code checksum} and {@code size_bytes} are what make this a
     * <em>completed</em> asset: since Step 16A.50 the publish gate counts only
     * cover links whose asset has a checksum, because a descriptor with no bytes
     * is not a hero image. Writing them here keeps the fixture standing for what
     * it always claimed to stand for — a real photograph — rather than for the
     * byte-less record the gate now rejects.
     *
     * <p>This is documented test setup for a condition unrelated to whatever the
     * calling test is checking. A test that is actually about the upload path
     * uses the real routes instead — see {@code MediaUploadIT}.
     */
    public void addHeroImage(UUID propertyId, UUID partnerId) {
        UUID assetId = jdbc.sql("""
                        INSERT INTO media_asset (partner_id, storage_key, mime_type, category,
                                                 size_bytes, checksum)
                        VALUES (:partner, :key, 'image/jpeg', CAST('EXTERIOR' AS media_category),
                                :size, :checksum)
                        RETURNING id
                        """)
                .param("partner", partnerId)
                .param("key", "test/" + UUID.randomUUID())
                .param("size", 70L)
                .param("checksum", UUID.randomUUID().toString().replace("-", ""))
                .query(UUID.class)
                .single();

        jdbc.sql("""
                        INSERT INTO media_link (media_asset_id, owner_type, owner_id, is_cover)
                        VALUES (:asset, CAST('PROPERTY' AS media_owner_type), :owner, true)
                        """)
                .param("asset", assetId)
                .param("owner", propertyId)
                .update();
    }

    /**
     * A bed arrangement, as a Partner would have recorded one.
     *
     * <p>{@code bed_type} is free text on the schema and the public response
     * returns it verbatim, so this writes a placeholder rather than a plausible
     * Vietnamese bed name — room wording is config A1 / OQ-010 and is not
     * invented in a fixture.
     */
    public void addBedConfiguration(UUID roomTypeId) {
        jdbc.sql("""
                        INSERT INTO room_type_bed_config
                            (room_type_id, bed_type, bed_count, is_default, sort_order)
                        VALUES (:rt, 'TEST_BED', 1, true, 0)
                        """)
                .param("rt", roomTypeId)
                .update();
    }

    /**
     * One completed asset linked to a <strong>room type</strong>, not to the
     * property.
     *
     * <p>The distinction is the point: {@code media_link.owner_type} is what
     * keeps a lobby photograph out of a bedroom gallery, and the two guest
     * components rely on it. Written with a {@code checksum} and
     * {@code size_bytes} for the same reason {@link #addHeroImage} is — a
     * descriptor with no bytes is not a photograph.
     *
     * <p>Both the asset and the link are set {@code PUBLISHED} explicitly. Each
     * column defaults to {@code DRAFT}, and {@code PublishedMediaRepository}
     * requires {@code a.status = 'PUBLISHED' AND a.visibility = 'PUBLIC' AND
     * l.status = 'PUBLISHED'} — so a fixture that took the defaults would build
     * a photograph no guest can ever see, and any test using it would be
     * asserting against an empty gallery without saying so.
     */
    public void addRoomPhotograph(UUID partnerId, UUID roomTypeId) {
        addPublishedPhotograph(partnerId, "ROOM_TYPE", roomTypeId);
    }

    /**
     * The same, owned by the property — the lobby or the exterior.
     *
     * <p>Distinct from {@link #addHeroImage}, which exists to satisfy the
     * <em>publish gate</em> and deliberately leaves the asset {@code DRAFT}. This
     * one is a photograph a guest can actually see, which is a different fact.
     */
    public void addPropertyPhotograph(UUID partnerId, UUID propertyId) {
        addPublishedPhotograph(partnerId, "PROPERTY", propertyId);
    }

    private void addPublishedPhotograph(UUID partnerId, String ownerType, UUID ownerId) {
        UUID assetId = jdbc.sql("""
                        INSERT INTO media_asset (partner_id, storage_key, mime_type, category,
                                                 size_bytes, checksum, status, visibility)
                        VALUES (:partner, :key, 'image/jpeg', CAST('ROOM' AS media_category),
                                :size, :checksum,
                                CAST('PUBLISHED' AS media_status),
                                CAST('PUBLIC' AS media_visibility))
                        RETURNING id
                        """)
                .param("partner", partnerId)
                .param("key", "test/" + UUID.randomUUID())
                .param("size", 70L)
                .param("checksum", UUID.randomUUID().toString().replace("-", ""))
                .query(UUID.class)
                .single();

        jdbc.sql("""
                        INSERT INTO media_link (media_asset_id, owner_type, owner_id,
                                                is_cover, status)
                        VALUES (:asset, CAST(:ownerType AS media_owner_type), :owner, true,
                                CAST('PUBLISHED' AS media_status))
                        """)
                .param("asset", assetId)
                .param("ownerType", ownerType)
                .param("owner", ownerId)
                .update();
    }

    public void addSignatureExperience(UUID propertyId) {
        jdbc.sql("INSERT INTO property_experience (property_id) VALUES (:p)")
                .param("p", propertyId)
                .update();
    }

    /** Sets the display name in both locales, as the create endpoint does. */
    public void setPropertyNames(UUID propertyId, String name) {
        jdbc.sql("""
                        INSERT INTO property_translation (property_id, locale, name)
                        VALUES (:p, 'en', :n), (:p, 'vi', :n)
                        ON CONFLICT (property_id, locale) DO UPDATE SET name = EXCLUDED.name
                        """)
                .param("p", propertyId)
                .param("n", name)
                .update();
    }

    /** How many cover links an owner has. The partial unique index must keep this &lt;= 1. */
    public long coverCount(String ownerType, UUID ownerId) {
        return jdbc.sql("""
                        SELECT count(*) FROM media_link
                         WHERE owner_type = CAST(:t AS media_owner_type)
                           AND owner_id = :o AND is_cover
                        """)
                .param("t", ownerType)
                .param("o", ownerId)
                .query(Long.class)
                .single();
    }

    public boolean mediaAssetExists(UUID assetId) {
        return jdbc.sql("SELECT count(*) FROM media_asset WHERE id = :id")
                .param("id", assetId)
                .query(Long.class)
                .single() > 0;
    }

    /** Archives an asset, as deduplication does when it folds a duplicate away. */
    public void archiveMediaAsset(UUID assetId) {
        jdbc.sql("UPDATE media_asset SET status = CAST('ARCHIVED' AS media_status), archived_at = now() WHERE id = :id")
                .param("id", assetId)
                .update();
    }

    public String storageKeyOf(UUID assetId) {
        return jdbc.sql("SELECT storage_key FROM media_asset WHERE id = :id")
                .param("id", assetId)
                .query(String.class)
                .single();
    }

    /**
     * An asset carrying a storage key the platform no longer mints.
     *
     * <p>Written directly because the route cannot produce one any more — that is
     * the whole point. Real rows in this shape exist in {@code kas_web_dev}, and
     * {@code MediaDeliveryKeyIT} uses this to prove they still address their own
     * objects after the key convention changed.
     */
    public UUID createAssetWithStorageKey(UUID partnerId, String storageKey) {
        return jdbc.sql("""
                        INSERT INTO media_asset (partner_id, storage_key, mime_type, category,
                                                 width, height, size_bytes)
                        VALUES (:partner, :key, 'image/png', CAST('EXTERIOR' AS media_category),
                                2400, 1600, 812345)
                        RETURNING id
                        """)
                .param("partner", partnerId)
                .param("key", storageKey)
                .query(UUID.class)
                .single();
    }

    public String slugOf(UUID propertyId) {
        return jdbc.sql("SELECT slug FROM property WHERE id = :id")
                .param("id", propertyId)
                .query(String.class)
                .single();
    }

    public String lifecycleStateOf(UUID propertyId) {
        return jdbc.sql("SELECT lifecycle_state::text FROM property WHERE id = :id")
                .param("id", propertyId)
                .query(String.class)
                .single();
    }

    public String submissionStatusOf(UUID submissionId) {
        return jdbc.sql("SELECT status::text FROM property_submission WHERE id = :id")
                .param("id", submissionId)
                .query(String.class)
                .single();
    }

    public String decisionReasonOf(UUID submissionId) {
        return jdbc.sql("SELECT decision_reason FROM property_submission WHERE id = :id")
                .param("id", submissionId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public long auditCount(String action, UUID entityId) {
        return jdbc.sql("SELECT count(*) FROM audit_log WHERE action = :a AND entity_id = :e")
                .param("a", action)
                .param("e", entityId)
                .query(Long.class)
                .single();
    }

    // ------------------------------------------------------- Phase 7.5E inventory

    /**
     * Writes one inventory day directly.
     *
     * <p>Used where a test needs a starting position rather than to exercise the
     * adjustment API. The oversell CHECK still applies — a fixture cannot seed an
     * impossible row, which is the point.
     *
     * <p>No production quantity is implied by any number a test passes here.
     * Room quantities are business input A2 and remain {@code OPEN} (doc 51 §2).
     */
    public void setInventory(UUID roomTypeId, java.time.LocalDate date, int total,
                             int maintenance, int otherBlocks, int bufferTarget) {
        jdbc.sql("""
                        INSERT INTO room_type_inventory_day
                            (room_type_id, date, total, maintenance, other_blocks, buffer_target)
                        VALUES (:rt, :d, :total, :maintenance, :otherBlocks, :buffer)
                        ON CONFLICT (room_type_id, date) DO UPDATE SET
                            total = EXCLUDED.total,
                            maintenance = EXCLUDED.maintenance,
                            other_blocks = EXCLUDED.other_blocks,
                            buffer_target = EXCLUDED.buffer_target
                        """)
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .param("total", total)
                .param("maintenance", maintenance)
                .param("otherBlocks", otherBlocks)
                .param("buffer", bufferTarget)
                .update();
    }

    /**
     * Moves {@code direct_committed} as an allocation would.
     *
     * <p>Phase 7.5E supplies the allocation primitive; the flow that calls it —
     * request submission — is a later phase. Tests therefore move the counter
     * directly, which is enough because the guarantee under test is the CHECK,
     * and the CHECK fires on the row regardless of who wrote it.
     */
    public void applyDirect(UUID roomTypeId, java.time.LocalDate date, int delta) {
        applyDelta("direct_committed", roomTypeId, date, delta);
    }

    public void applyOta(UUID roomTypeId, java.time.LocalDate date, int delta) {
        applyDelta("ota_committed", roomTypeId, date, delta);
    }

    private void applyDelta(String column, UUID roomTypeId, java.time.LocalDate date, int delta) {
        jdbc.sql("UPDATE room_type_inventory_day SET " + column + " = " + column + " + :delta "
                        + "WHERE room_type_id = :rt AND date = :d")
                .param("delta", delta)
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .update();
    }

    public int bufferTarget(UUID roomTypeId, java.time.LocalDate date) {
        return counter("buffer_target", roomTypeId, date);
    }

    public long inventoryDayCount(UUID roomTypeId) {
        return jdbc.sql("SELECT count(*) FROM room_type_inventory_day WHERE room_type_id = :rt")
                .param("rt", roomTypeId)
                .query(Long.class)
                .single();
    }

    /**
     * A channel-scoped buffer rule, written directly.
     *
     * <p>The API refuses to create one (OQ-115b defers the channel dimension), so this exists to
     * prove the <em>resolver</em> also ignores such a row if one reaches the table another way —
     * a migration, a manual fix, or a future V2 rule sitting alongside V1 ones.
     */
    public UUID addChannelScopedBufferRule(UUID propertyId, UUID roomTypeId,
                                           java.time.LocalDate date) {
        return jdbc.sql("""
                        INSERT INTO ota_safety_buffer_rule
                            (property_id, room_type_id, distribution_channel_id, date_from, date_to,
                             buffer_type, buffer_value, priority, status)
                        SELECT :p, :rt, c.id, :d, :d, CAST('FIXED_ROOMS' AS buffer_type), 3, 99,
                               CAST('ACTIVE' AS rule_status)
                          FROM distribution_channel c
                         WHERE c.code = 'AGODA'
                        RETURNING id
                        """)
                .param("p", propertyId)
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .query(UUID.class)
                .single();
    }

    /** Availability as the <em>database</em> computes it, through the frozen function. */
    public int availableDirect(UUID roomTypeId, java.time.LocalDate date) {
        return jdbc.sql("""
                        SELECT available_direct(i.*) FROM room_type_inventory_day i
                         WHERE i.room_type_id = :rt AND i.date = :d
                        """)
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .query(Integer.class)
                .single();
    }

    public int directCommitted(UUID roomTypeId, java.time.LocalDate date) {
        return counter("direct_committed", roomTypeId, date);
    }

    public int otaCommitted(UUID roomTypeId, java.time.LocalDate date) {
        return counter("ota_committed", roomTypeId, date);
    }

    private int counter(String column, UUID roomTypeId, java.time.LocalDate date) {
        return jdbc.sql("SELECT " + column + " FROM room_type_inventory_day "
                        + "WHERE room_type_id = :rt AND date = :d")
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .query(Integer.class)
                .single();
    }

    /**
     * An ACTIVE rate rule.
     *
     * <p>Written directly because Phase 7.5E ships the resolver and the doc 58 §8
     * admin rate surface separately; the resolution rules of doc 56 §3.1 are what
     * these tests are about, and they are identical whichever way the row arrived.
     *
     * <p>Every amount passed here is a synthetic fixture. Base rates per room type
     * are config B6 and remain OPEN (doc 56 §9) — no KAS price exists.
     *
     * @param scope      {@code PROPERTY} or {@code ROOM_TYPE}
     * @param daysOfWeek PostgreSQL {@code dow} (0 = Sunday), or null for every day
     */
    public UUID addRateRule(String scope, UUID propertyId, UUID roomTypeId, String name,
                            int priority, java.time.LocalDate dateFrom, java.time.LocalDate dateTo,
                            String daysOfWeek, Long priceMinor,
                            java.math.BigDecimal adjustmentPercent) {
        return jdbc.sql("""
                        INSERT INTO rate_rule
                            (scope, property_id, room_type_id, name, priority, date_from, date_to,
                             days_of_week, price_minor, adjustment_percent, status)
                        VALUES (CAST(:scope AS rate_scope), :propertyId, :roomTypeId, :name,
                                :priority, CAST(:dateFrom AS date), CAST(:dateTo AS date),
                                CAST(:dow AS smallint[]), :price, :adjustment,
                                CAST('ACTIVE' AS rule_status))
                        RETURNING id
                        """)
                .param("scope", scope)
                .param("propertyId", propertyId)
                .param("roomTypeId", roomTypeId)
                .param("name", name)
                .param("priority", priority)
                .param("dateFrom", dateFrom == null ? null : java.sql.Date.valueOf(dateFrom))
                .param("dateTo", dateTo == null ? null : java.sql.Date.valueOf(dateTo))
                .param("dow", daysOfWeek)
                .param("price", priceMinor)
                .param("adjustment", adjustmentPercent)
                .query(UUID.class)
                .single();
    }

    public void setRateRuleStatus(UUID ruleId, String status) {
        jdbc.sql("UPDATE rate_rule SET status = CAST(:s AS rule_status) WHERE id = :id")
                .param("s", status)
                .param("id", ruleId)
                .update();
    }

    /**
     * Simulates the release S11/S13 will perform — bounded to ONE reservation.
     *
     * <p>Doc 14 §7 releases a hold by state transition, and doc 55 §5 gives back
     * the {@code direct_committed} it consumed. Neither transition is implemented
     * yet (they are later steps), so a test that needs a released hold does both
     * here, scoped by reservation id. Never a table-wide UPDATE.
     */
    public void releaseHoldsOfReservation(String reference) {
        jdbc.sql("""
                        UPDATE room_type_inventory_day i
                           SET direct_committed = i.direct_committed - h.quantity
                          FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE h.room_type_id = i.room_type_id
                           AND h.date = i.date
                           AND h.status = 'ACTIVE'
                           AND r.reference = :ref
                        """)
                .param("ref", reference)
                .update();

        jdbc.sql("""
                        UPDATE inventory_hold h
                           SET status = 'RELEASED', released_at = now()
                          FROM reservation r
                         WHERE r.id = h.reservation_id
                           AND h.status = 'ACTIVE'
                           AND r.reference = :ref
                        """)
                .param("ref", reference)
                .update();
    }

    public long activeHoldCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.status = 'ACTIVE'
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    public long releasedHoldCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.status = 'RELEASED'
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    // ---- Step 16A.9 — S2 / S3 / S4 / S10 reads -------------------------------

    /** Holds that S10 made firm. Doc 54 S10 under owner decision 1 (OQ-172 B). */
    public long convertedHoldCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.status = 'CONVERTED'
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /**
     * Holds of this reservation whose {@code expires_at} is null.
     *
     * <p>Must always be zero: the column is {@code NOT NULL}, and owner
     * decision 1 kept it that way rather than clearing it on conversion.
     */
    public long holdsWithNullExpiryFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.expires_at IS NULL
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** Moves this request's SLA deadline into the past, so it reads as breached. */
    public void backdateSlaDueAt(String reference) {
        jdbc.sql("UPDATE reservation SET sla_due_at = now() - interval '1 hour'"
                        + " WHERE reference = :ref")
                .param("ref", reference)
                .update();
    }

    /** Sets an existing reservation's lead source to another value of the enum. */
    public void setLeadSource(String reference, String leadSource) {
        jdbc.sql("UPDATE reservation SET lead_source = CAST(:ls AS lead_source)"
                        + " WHERE reference = :ref")
                .param("ls", leadSource)
                .param("ref", reference)
                .update();
    }

    public long noteCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_note n
                          JOIN reservation r ON r.id = n.reservation_id
                         WHERE r.reference = :ref
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** The author the server recorded — stored, never returned by the API. */
    public String noteAdminId(String reference) {
        return jdbc.sql("""
                        SELECT n.admin_id::text FROM reservation_note n
                          JOIN reservation r ON r.id = n.reservation_id
                         WHERE r.reference = :ref
                         ORDER BY n.created_at DESC, n.id DESC LIMIT 1
                        """)
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    // ---- Step 16A.16 — S13 expiry -------------------------------------------

    /**
     * Moves this reservation's hold expiry into the past.
     *
     * <p>The only way to test a time-based sweep without waiting. It writes
     * expires_at and nothing else, which is exactly what the passage of time
     * would do; the hold_expiry_after_creation CHECK still holds because
     * created_at moves with it.
     */
    public void backdateHoldExpiry(String reference) {
        jdbc.sql("""
                        UPDATE inventory_hold h
                           SET created_at = now() - interval '48 hours',
                               expires_at = now() - interval '24 hours'
                          FROM reservation r
                         WHERE r.id = h.reservation_id AND r.reference = :ref
                        """)
                .param("ref", reference)
                .update();
    }

    public long expiredHoldCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.status = 'EXPIRED'
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** One column of any hold on this reservation, as text. */
    public String holdText(String reference, String column) {
        return jdbc.sql("SELECT h." + column + "::text FROM inventory_hold h"
                        + " JOIN reservation r ON r.id = h.reservation_id"
                        + " WHERE r.reference = :ref LIMIT 1")
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public String statusHistoryActorType(String reference, String toStatus) {
        return historyColumn(reference, toStatus, "actor_type");
    }

    public String statusHistoryActorId(String reference, String toStatus) {
        return historyColumn(reference, toStatus, "actor_id");
    }

    private String historyColumn(String reference, String toStatus, String column) {
        return jdbc.sql("SELECT h." + column + "::text"
                        + " FROM reservation_status_history h"
                        + " JOIN reservation r ON r.id = h.reservation_id"
                        + " WHERE r.reference = :ref AND h.to_status = :to LIMIT 1")
                .param("ref", reference)
                .param("to", toStatus)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public long contactLogCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_contact_log c
                          JOIN reservation r ON r.id = c.reservation_id
                         WHERE r.reference = :ref
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** One column of the NEWEST contact-log row, as text. */
    public String contactLogText(String reference, String column) {
        return jdbc.sql("SELECT c." + column + "::text"
                        + " FROM reservation_contact_log c"
                        + " JOIN reservation r ON r.id = c.reservation_id"
                        + " WHERE r.reference = :ref"
                        + " ORDER BY c.contacted_at DESC, c.id DESC LIMIT 1")
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /** The distinct release reason on this reservation's holds — S11 and S12 differ. */
    public String holdReleaseReason(String reference) {
        return jdbc.sql("""
                        SELECT DISTINCT h.release_reason FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.release_reason IS NOT NULL
                        """)
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public long assignmentCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_assignment a
                          JOIN reservation r ON r.id = a.reservation_id
                         WHERE r.reference = :ref
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /**
     * One column of the assignment row that moved ownership TO {@code owner}.
     *
     * <p>Addressed by target rather than by "newest": {@code now()} is the
     * transaction timestamp, so two assignments written inside one test
     * transaction carry identical {@code created_at} values and no ORDER BY can
     * tell them apart.
     */
    public String assignmentText(String reference, UUID owner, String column) {
        return jdbc.sql("SELECT a." + column + "::text"
                        + " FROM reservation_assignment a"
                        + " JOIN reservation r ON r.id = a.reservation_id"
                        + " WHERE r.reference = :ref AND a.to_owner_id = :owner")
                .param("ref", reference)
                .param("owner", owner)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public long availabilityCheckCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_availability_check c
                          JOIN reservation r ON r.id = c.reservation_id
                         WHERE r.reference = :ref
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** One column of the NEWEST availability-check row, as text. */
    public String availabilityCheckText(String reference, String column) {
        return jdbc.sql("SELECT c." + column + "::text"
                        + " FROM reservation_availability_check c"
                        + " JOIN reservation r ON r.id = c.reservation_id"
                        + " WHERE r.reference = :ref"
                        + " ORDER BY c.checked_at DESC, c.id DESC LIMIT 1")
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /** Status-history rows for one reservation and one lifecycle field. */
    public long statusHistoryCountFor(String reference, String field) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_status_history h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.field = CAST(:f AS status_field)
                        """)
                .param("ref", reference)
                .param("f", field)
                .query(Long.class)
                .single();
    }

    public long paymentCount() {
        return created("payment");
    }

    // ---- Step 16A reservation reads -----------------------------------------

    public long customerCount() {
        return created("customer");
    }

    public long reservationCount() {
        return created("reservation");
    }

    public long holdCount() {
        return created("inventory_hold");
    }

    public long idempotencyCount() {
        return created("reservation_request_idempotency");
    }

    public long reservationLineCount() {
        return created("reservation_line");
    }

    public long statusHistoryCount() {
        return created("reservation_status_history");
    }

    // ---- Counting only what the running test created -------------------------

    /**
     * Rows each counter saw before the current test ran, by table.
     *
     * <p>Reset per test by {@code SecurityIntegrationTest#captureRowBaseline}.
     * Safe as instance state on this singleton because the suite runs
     * sequentially — neither surefire nor failsafe is configured to fork or
     * parallelise here.
     */
    private final java.util.Map<String, Long> baseline = new java.util.HashMap<>();

    /**
     * Forgets the previous test's baseline, so the counters below start from
     * whatever the database already holds.
     *
     * <h2>Why these counts are relative</h2>
     *
     * They used to be {@code SELECT count(*)} over the whole table, and every
     * call site reads as <em>"did this submission create a reservation?"</em> —
     * a question about the test's own rows. That only coincided with an absolute
     * count while {@code kas_web_dev} happened to hold none. The moment the
     * database contains a real reservation, thirty-four assertions of the form
     * {@code assertThat(reservationCount()).isZero()} fail while describing
     * nothing about the code under test.
     *
     * <p>Each test runs in a transaction that is rolled back, so "created since
     * the baseline" is exactly "created by this test". The assertions keep their
     * literal expected values and gain independence from whatever else lives in
     * the database.
     */
    void resetRowBaseline() {
        baseline.clear();
        for (String table : COUNTED_TABLES) {
            baseline.put(table, rows(table));
        }
    }

    /**
     * The tables the counters above report on.
     *
     * <p>Read eagerly at the start of every test rather than on first use: a
     * test that acts and <em>then</em> counts — {@code submit(...); assertThat(
     * reservationCount()).isEqualTo(1)} — would otherwise take its baseline
     * after its own row already existed and see zero.
     */
    private static final List<String> COUNTED_TABLES = List.of(
            "payment", "customer", "reservation", "inventory_hold",
            "reservation_request_idempotency", "reservation_line",
            "reservation_status_history");

    /** How many rows this test added to {@code table}. */
    private long created(String table) {
        Long before = baseline.get(table);
        if (before == null) {
            // Only reachable if a counter is added without listing its table
            // above. Failing loudly beats silently reporting an absolute count.
            throw new IllegalStateException(table + " is not in COUNTED_TABLES");
        }
        return rows(table) - before;
    }

    private long rows(String table) {
        // The table name is a literal from COUNTED_TABLES, never request or test
        // input. Nothing a caller supplies becomes SQL.
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    /** One column of the reservation with this reference, rendered as text. */
    public String reservationText(String reference, String column) {
        return jdbc.sql("SELECT " + column + "::text FROM reservation WHERE reference = :ref")
                .param("ref", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /** One column of one reservation line, by room type, rendered as text. */
    public String reservationLineText(String reference, UUID roomTypeId, String column) {
        return jdbc.sql("SELECT l." + column + "::text"
                        + " FROM reservation_line l"
                        + " JOIN reservation r ON r.id = l.reservation_id"
                        + " WHERE r.reference = :ref AND l.room_type_id = :rt")
                .param("ref", reference)
                .param("rt", roomTypeId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /**
     * The reason recorded on the transition INTO {@code toStatus}.
     *
     * <p>Selected by the status rather than by "most recent": two rows written in
     * the same millisecond tie on {@code created_at}, and a random UUID is no
     * tiebreak at all.
     */
    public String statusHistoryReason(String reference, String toStatus) {
        return jdbc.sql("""
                        SELECT h.reason
                          FROM reservation_status_history h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref AND h.to_status = :to
                        """)
                .param("ref", reference)
                .param("to", toStatus)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /**
     * Rows in {@code email_log}.
     *
     * <p>V18 created the table and <strong>nothing writes to it</strong> — doc 117
     * §8.1. A test asserting zero is asserting that no step has quietly started
     * faking delivery while OQ-162 is open.
     */
    public long emailLogCount() {
        return jdbc.sql("SELECT count(*) FROM email_log").query(Long.class).single();
    }

    /** One locale's property name, so a test can prove which locale was snapshotted. */
    public void setPropertyName(UUID propertyId, String locale, String name) {
        jdbc.sql("""
                        INSERT INTO property_translation (property_id, locale, name)
                        VALUES (:p, :l, :n)
                        ON CONFLICT (property_id, locale) DO UPDATE SET name = EXCLUDED.name
                        """)
                .param("p", propertyId)
                .param("l", locale)
                .param("n", name)
                .update();
    }

    /** Seconds between two timestamptz columns of one reservation. */
    public long reservationSecondsBetween(String reference, String from, String to) {
        return jdbc.sql("SELECT EXTRACT(EPOCH FROM (" + to + " - " + from + "))::bigint"
                        + " FROM reservation WHERE reference = :ref")
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    /** Seconds between the first hold's expiry and its reservation's requested_at. */
    public long holdSecondsFromRequest(String reference) {
        return jdbc.sql("""
                        SELECT EXTRACT(EPOCH FROM (h.expires_at - r.requested_at))::bigint
                          FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref
                         ORDER BY h.date
                         LIMIT 1
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    public long holdCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM inventory_hold h
                          JOIN reservation r ON r.id = h.reservation_id
                         WHERE r.reference = :ref
                        """)
                .param("ref", reference)
                .query(Long.class)
                .single();
    }

    public void deleteInventory(UUID roomTypeId, java.time.LocalDate date) {
        jdbc.sql("DELETE FROM room_type_inventory_day WHERE room_type_id = :rt AND date = :d")
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .update();
    }

    /**
     * Assigns a catalogue amenity to a property, by its stable code.
     *
     * <p>The catalogue itself is seeded by the repeatable migration, so this only
     * ever creates the {@code property_amenity} link doc 03 §6 calls the
     * per-property assignment.
     */
    public void assignAmenity(UUID propertyId, String code, boolean isHighlight, int sortOrder) {
        jdbc.sql("""
                        INSERT INTO property_amenity (property_id, amenity_id, is_highlight, sort_order)
                        SELECT :p, a.id, :highlight, :sort FROM amenity a WHERE a.code = :code
                        """)
                .param("p", propertyId)
                .param("code", code)
                .param("highlight", isHighlight)
                .param("sort", sortOrder)
                .update();
    }

    public UUID propertyIdOf(String slug) {
        return jdbc.sql("SELECT id FROM property WHERE slug = :s")
                .param("s", slug)
                .query(UUID.class)
                .single();
    }

    /**
     * A property's map position — doc 58 §3.1's {@code /public/locations} reads it.
     *
     * <p>Test-only. V23 leaves {@code latitude} and {@code longitude} deliberately
     * unseeded for the eight real hotels, so a test that needs a point writes one
     * onto its own fixture rather than onto production data.
     */
    public void setCoordinates(UUID propertyId, java.math.BigDecimal latitude,
                               java.math.BigDecimal longitude) {
        jdbc.sql("UPDATE property SET latitude = :lat, longitude = :lng WHERE id = :p")
                .param("lat", latitude)
                .param("lng", longitude)
                .param("p", propertyId)
                .update();
    }

    /** The district a property is in — doc 58 §3.1's portfolio filter reads it. */
    public void setDistrict(UUID propertyId, String district) {
        jdbc.sql("UPDATE property SET district = :d WHERE id = :p")
                .param("d", district)
                .param("p", propertyId)
                .update();
    }

    /**
     * Supplies a catalogue name in one locale.
     *
     * <p>{@code R__reference_amenities} seeds codes and categories only — it says
     * so itself: <em>"This file creates the words, never the claims."</em> The
     * names are doc 51 A9 / OQ-031, still unsupplied, so a test that needs one
     * writes it and removes it again.
     */
    public void nameAmenity(String code, String locale, String name) {
        jdbc.sql("""
                        INSERT INTO amenity_translation (amenity_id, locale, name)
                        SELECT a.id, :l, :n FROM amenity a WHERE a.code = :code
                        ON CONFLICT (amenity_id, locale) DO UPDATE SET name = EXCLUDED.name
                        """)
                .param("code", code)
                .param("l", locale)
                .param("n", name)
                .update();
    }

    /** Withdraws a code from the shared catalogue without unassigning it. */
    public void archiveAmenity(String code) {
        jdbc.sql("UPDATE amenity SET archived_at = now() WHERE code = :code")
                .param("code", code)
                .update();
    }

    public void restoreAmenity(String code) {
        jdbc.sql("UPDATE amenity SET archived_at = NULL WHERE code = :code")
                .param("code", code)
                .update();
    }

    public void removeAmenityTranslation(String code, String locale) {
        jdbc.sql("DELETE FROM amenity_translation WHERE locale = :l AND amenity_id = "
                        + "(SELECT id FROM amenity WHERE code = :code)")
                .param("l", locale)
                .param("code", code)
                .update();
    }

    /** Moves a request along its sales lifecycle, to prove the receipt does not follow. */
    public void setSalesStatus(String reference, String salesStatus) {
        jdbc.sql("UPDATE reservation SET sales_status = CAST(:s AS sales_status) WHERE reference = :ref")
                .param("s", salesStatus)
                .param("ref", reference)
                .update();
    }

    /** Null until a property has been published — the stamp {@code updateLifecycle} writes. */
    public String publishedAtOf(UUID propertyId) {
        return jdbc.sql("SELECT published_at::text FROM property WHERE id = :id")
                .param("id", propertyId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    public String signatureLineOf(UUID propertyId, String locale) {
        return jdbc.sql("SELECT signature_line FROM property_translation "
                        + "WHERE property_id = :id AND locale = :l")
                .param("id", propertyId)
                .param("l", locale)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /** Used to force the collision doc 52 §3.1 forbids across published properties. */
    public void setSignatureLine(UUID propertyId, String locale, String signatureLine) {
        jdbc.sql("UPDATE property_translation SET signature_line = :s "
                        + "WHERE property_id = :id AND locale = :l")
                .param("s", signatureLine)
                .param("id", propertyId)
                .param("l", locale)
                .update();
    }

    public java.util.List<UUID> roomTypeIdsOf(UUID propertyId) {
        return jdbc.sql("SELECT id FROM room_type WHERE property_id = :id ORDER BY sort_order, slug")
                .param("id", propertyId)
                .query(UUID.class)
                .list();
    }

    public void setLifecycle(UUID propertyId, String lifecycleState) {
        jdbc.sql("UPDATE property SET lifecycle_state = CAST(:s AS property_lifecycle_state) "
                        + "WHERE id = :id")
                .param("s", lifecycleState)
                .param("id", propertyId)
                .update();
    }

    public void setRoomTypeStatus(UUID roomTypeId, String status) {
        jdbc.sql("UPDATE room_type SET status = CAST(:s AS room_type_status) WHERE id = :id")
                .param("s", status)
                .param("id", roomTypeId)
                .update();
    }

    public void clearBasePrice(UUID roomTypeId) {
        jdbc.sql("UPDATE room_type SET base_price_minor = NULL WHERE id = :id")
                .param("id", roomTypeId)
                .update();
    }

    public void publishRoomType(UUID roomTypeId) {
        jdbc.sql("UPDATE room_type SET status = 'PUBLISHED' WHERE id = :id")
                .param("id", roomTypeId)
                .update();
    }

    /** How many of a property's room types are live — read straight from the row. */
    public int publishedRoomTypeCountOf(UUID propertyId) {
        Integer count = jdbc.sql("SELECT count(*) FROM room_type "
                        + "WHERE property_id = :id AND status = 'PUBLISHED' "
                        + "AND archived_at IS NULL")
                .param("id", propertyId)
                .query(Integer.class)
                .single();
        return count == null ? 0 : count;
    }

    /** A base nightly rate, so a room type can be priced at all — doc 56 §3 Layer 0. */
    public void setBasePrice(UUID roomTypeId, long amountMinor) {
        jdbc.sql("UPDATE room_type SET base_price_minor = :p WHERE id = :id")
                .param("p", amountMinor)
                .param("id", roomTypeId)
                .update();
    }

    public void openProperty(UUID propertyId) {
        jdbc.sql("UPDATE property SET lifecycle_state = 'OPEN' WHERE id = :id")
                .param("id", propertyId)
                .update();
    }

    /** Supplies a business setting for the duration of one test's transaction. */
    /** Moves an account out of ACTIVE — a suspended user is not an assignable owner. */
    public void setUserStatus(UUID userId, String status) {
        jdbc.sql("UPDATE app_user SET status = CAST(:s AS user_status) WHERE id = :id")
                .param("s", status)
                .param("id", userId)
                .update();
    }

    public void setSetting(String key, String value) {
        jdbc.sql("UPDATE system_setting SET value = :v WHERE key = :k")
                .param("v", value)
                .param("k", key)
                .update();
    }

    /** Removes a business setting for the duration of one test's transaction. */
    public void clearSetting(String key) {
        jdbc.sql("UPDATE system_setting SET value = NULL WHERE key = :k")
                .param("k", key)
                .update();
    }

    /** The value a setting currently holds. Fails if it is unset. */
    public String settingValue(String key) {
        return jdbc.sql("SELECT value FROM system_setting WHERE key = :k")
                .param("k", key)
                .query(String.class)
                .single();
    }

    /**
     * An ACTIVE hold with an explicit expiry, so both sides of doc 55 §3.5 are
     * testable.
     *
     * <p>{@code created_at} is written explicitly rather than defaulted, because
     * {@code hold_expiry_after_creation} requires {@code expires_at > created_at}
     * — an already-expired hold is therefore one created further in the past, not
     * one with an expiry behind its creation. That constraint is doc 55 §5's
     * structural guarantee that "no hold can lock inventory permanently", so the
     * fixture works within it rather than around it.
     */
    public UUID addHold(UUID propertyId, UUID roomTypeId, java.time.LocalDate date, int quantity,
                        UUID reservationId, UUID inquiryId, java.time.Instant expiresAt) {
        java.time.Instant createdAt = expiresAt.minusSeconds(3600);
        return jdbc.sql("""
                        INSERT INTO inventory_hold
                            (hold_type, reservation_id, inquiry_id, property_id, room_type_id,
                             date, quantity, created_at, expires_at)
                        VALUES (CAST('REQUEST' AS hold_type), :res, :inq, :prop, :rt, :d, :q,
                                :created, :exp)
                        RETURNING id
                        """)
                .param("res", reservationId)
                .param("inq", inquiryId)
                .param("prop", propertyId)
                .param("rt", roomTypeId)
                .param("d", java.sql.Date.valueOf(date))
                .param("q", quantity)
                .param("created", java.sql.Timestamp.from(createdAt))
                .param("exp", java.sql.Timestamp.from(expiresAt))
                .query(UUID.class)
                .single();
    }

    public UUID createInquiry(String text) {
        return jdbc.sql("""
                        INSERT INTO sales_inquiry (lead_source, contact_name, inquiry_text)
                        VALUES (CAST('WEBSITE' AS lead_source), 'TEST_CONTACT', :text)
                        RETURNING id
                        """)
                .param("text", text)
                .query(UUID.class)
                .single();
    }

    public String policyStatusOf(UUID policyId) {
        return jdbc.sql("SELECT status::text FROM property_policy WHERE id = :id")
                .param("id", policyId)
                .query(String.class)
                .single();
    }

    public long policyCount(UUID propertyId) {
        return jdbc.sql("SELECT count(*) FROM property_policy WHERE property_id = :id")
                .param("id", propertyId)
                .query(Long.class)
                .single();
    }

    /** A partner's shared policies — the rows with no property. */
    public long sharedPolicyCount(UUID partnerId) {
        return jdbc.sql("""
                        SELECT count(*) FROM property_policy
                         WHERE partner_id = :id AND property_id IS NULL
                        """)
                .param("id", partnerId)
                .query(Long.class)
                .single();
    }

    /**
     * Whether a named table constraint exists.
     *
     * <p>Used where a test proves the <em>application</em> behaves correctly but
     * the real guard against a concurrent caller is the database. Asserting the
     * constraint is present keeps the two claims honest: the test would otherwise
     * read as if the service logic were sufficient on its own.
     */
    public boolean constraintExists(String table, String constraint) {
        return jdbc.sql("""
                        SELECT count(*)
                          FROM pg_constraint c
                          JOIN pg_class t ON t.oid = c.conrelid
                          JOIN pg_namespace n ON n.oid = t.relnamespace
                         WHERE n.nspname = 'kas' AND t.relname = :table AND c.conname = :constraint
                        """)
                .param("table", table)
                .param("constraint", constraint)
                .query(Long.class)
                .single() > 0;
    }

    public ScopeKind scopeKindOf(UUID userId) {
        return ScopeKind.valueOf(jdbc.sql(
                        "SELECT scope_kind::text FROM role_assignment WHERE user_id = :id LIMIT 1")
                .param("id", userId)
                .query(String.class)
                .single());
    }

    /** The user's most recent active session id, read straight from the table. */
    public UUID firstActiveSessionId(UUID userId) {
        return jdbc.sql("""
                        SELECT id FROM user_session
                         WHERE user_id = :id AND revoked_at IS NULL
                         ORDER BY created_at DESC LIMIT 1
                        """)
                .param("id", userId)
                .query(UUID.class)
                .single();
    }

    public long activeSessionCount(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_session "
                        + "WHERE user_id = :id AND revoked_at IS NULL")
                .param("id", userId)
                .query(Long.class)
                .single();
    }

    public int failedLoginCount(UUID userId) {
        return jdbc.sql("SELECT failed_login_count FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(Integer.class)
                .single();
    }

    /** Whether {@code locked_until} lies in the future. */
    public boolean isLocked(UUID userId) {
        return jdbc.sql("SELECT locked_until IS NOT NULL AND locked_until > now() FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(Boolean.class)
                .single();
    }

    public java.time.Instant lockedUntil(UUID userId) {
        return jdbc.sql("SELECT locked_until FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(java.sql.Timestamp.class)
                .optional()
                .map(java.sql.Timestamp::toInstant)
                .orElse(null);
    }

    /** Moves a lock into the past, as if its duration had elapsed. */
    public void expireLock(UUID userId) {
        jdbc.sql("UPDATE app_user SET locked_until = now() - interval '1 second' WHERE id = :id")
                .param("id", userId)
                .update();
    }

    /** Removes a user a non-transactional test committed; sessions and grants cascade. */
    public void deleteUser(UUID userId) {
        jdbc.sql("DELETE FROM app_user WHERE id = :id").param("id", userId).update();
    }

    /** Row count of one table, for asserting that a read-only endpoint wrote nothing. */
    public long countRows(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    public int maxOccupancyOf(UUID roomTypeId) {
        return jdbc.sql("SELECT max_occupancy FROM room_type WHERE id = :id")
                .param("id", roomTypeId)
                .query(Integer.class)
                .single();
    }

    public void unpublishRoomType(UUID roomTypeId) {
        jdbc.sql("UPDATE room_type SET status = 'DRAFT' WHERE id = :id")
                .param("id", roomTypeId)
                .update();
    }

    /** Removes one night's inventory row, so the stay is no longer fully covered — doc 15 §12. */
    public void clearInventory(UUID roomTypeId, java.time.LocalDate date) {
        jdbc.sql("DELETE FROM room_type_inventory_day WHERE room_type_id = :id AND date = :date")
                .param("id", roomTypeId)
                .param("date", java.sql.Date.valueOf(date))
                .update();
    }

    public void setLifecycleState(UUID propertyId, String state) {
        jdbc.sql("UPDATE property SET lifecycle_state = CAST(:state AS property_lifecycle_state) "
                        + "WHERE id = :id")
                .param("state", state)
                .param("id", propertyId)
                .update();
    }

    // ------------------------------------------------- reservations, all channels

    /**
     * An OTA reservation, as {@code POST /admin/ops/distribution/ota-reservations}
     * would create one — doc 58 §7: <em>"creates at {@code stayStatus =
     * CONFIRMED}, {@code salesStatus = NULL}"</em>.
     *
     * <p><strong>Written directly because that route does not exist.</strong> The
     * OTA recording API is unimplemented, so there is no product path to an OTA
     * reservation and a test that needs one has no honest alternative. Every
     * column below satisfies V12's six structural constraints rather than
     * bypassing them — {@code lead_source} and {@code sales_owner_id} NULL,
     * {@code sales_status} NULL, an {@code ota_reference} present — so the row is
     * exactly what the recording endpoint would have to write, not a shape the
     * schema would otherwise reject.
     *
     * <p>The reservation is given a real line and a real STAY history row, so a
     * timeline and a room list read back the same way a direct booking's do.
     */
    public String recordOtaReservation(UUID propertyId, UUID roomTypeId, String channelCode,
                                       String reference, String otaReference,
                                       java.time.LocalDate checkIn, java.time.LocalDate checkOut,
                                       String guestName, String guestEmail, String guestPhone,
                                       long totalMinor) {
        // V34 retired the seeded OTA channels; this row rolls back with the test.
        jdbc.sql("""
                        INSERT INTO distribution_channel (code, display_name, channel_type)
                        VALUES (:code, :code, 'OTA')
                        ON CONFLICT (code) DO NOTHING
                        """)
                .param("code", channelCode)
                .update();
        UUID channel = jdbc.sql("SELECT id FROM distribution_channel WHERE code = :code")
                .param("code", channelCode)
                .query(UUID.class)
                .single();

        UUID id = jdbc.sql("""
                        INSERT INTO reservation
                            (reference, property_id, distribution_channel_id, channel_type,
                             stay_status, ota_reference, ota_received_at,
                             check_in, check_out, adults, children,
                             guest_name, guest_email, guest_phone, guest_country,
                             currency, subtotal_minor, total_minor, confirmed_at)
                        VALUES (:reference, :property, :channel, 'OTA',
                                'CONFIRMED', :otaReference, now(),
                                :checkIn, :checkOut, 2, 0,
                                :name, :email, :phone, 'VN',
                                'VND', :total, :total, now())
                        RETURNING id
                        """)
                .param("reference", reference)
                .param("property", propertyId)
                .param("channel", channel)
                .param("otaReference", otaReference)
                .param("checkIn", java.sql.Date.valueOf(checkIn))
                .param("checkOut", java.sql.Date.valueOf(checkOut))
                .param("name", guestName)
                .param("email", guestEmail)
                .param("phone", guestPhone)
                .param("total", totalMinor)
                .query(UUID.class)
                .single();

        jdbc.sql("""
                        INSERT INTO reservation_line
                            (reservation_id, room_type_id, quantity, room_type_name_snapshot,
                             nightly_price_minor, line_total_minor)
                        VALUES (:reservation, :roomType, 1, 'TEST_ROOM', :nightly, :total)
                        """)
                .param("reservation", id)
                .param("roomType", roomTypeId)
                .param("nightly", totalMinor / Math.max(1, checkIn.until(checkOut).getDays()))
                .param("total", totalMinor)
                .update();

        jdbc.sql("""
                        INSERT INTO reservation_status_history
                            (reservation_id, field, from_status, to_status, actor_type, reason)
                        VALUES (:reservation, 'STAY', NULL, 'CONFIRMED', 'SYSTEM',
                                'Recorded from the channel')
                        """)
                .param("reservation", id)
                .update();

        return reference;
    }

    /**
     * Moves the stay lifecycle, without touching the sales one.
     *
     * <p>Doc 58 §6's {@code /check-in}, {@code /check-out} and {@code /no-show}
     * are unimplemented, so there is no product route to any stay status past
     * CONFIRMED. A test about filtering by stay status has to be able to produce
     * one.
     */
    public void setStayStatus(String reference, String stayStatus) {
        jdbc.sql("UPDATE reservation SET stay_status = CAST(:status AS stay_status) "
                        + "WHERE reference = :reference")
                .param("status", stayStatus)
                .param("reference", reference)
                .update();
    }

    /** The guest's own details, so a search has something distinctive to match. */
    public void setGuest(String reference, String name, String email, String phone) {
        jdbc.sql("""
                        UPDATE reservation
                           SET guest_name = :name, guest_email = :email, guest_phone = :phone
                         WHERE reference = :reference
                        """)
                .param("name", name)
                .param("email", email)
                .param("phone", phone)
                .param("reference", reference)
                .update();
    }

    /**
     * Ages a reservation, so ordering and the booking-date filter have a spread
     * to work against. Two requests submitted milliseconds apart cannot exercise
     * either.
     */
    public void backdateCreatedAt(String reference, int days) {
        jdbc.sql("UPDATE reservation SET created_at = created_at - make_interval(days => :days) "
                        + "WHERE reference = :reference")
                .param("days", days)
                .param("reference", reference)
                .update();
    }

    /**
     * How many messages one reservation carries.
     *
     * <p>Counted per reservation rather than over the table, so the assertion
     * says something about the reservation under test and stays true whatever
     * else the database holds.
     */
    public long messageCountFor(String reference) {
        return jdbc.sql("""
                        SELECT count(*) FROM reservation_message m
                          JOIN reservation r ON r.id = m.reservation_id
                         WHERE r.reference = :reference
                        """)
                .param("reference", reference)
                .query(Long.class)
                .single();
    }

    /** The body of the single message on a reservation, for a render assertion. */
    public String messageBodyFor(String reference) {
        return jdbc.sql("""
                        SELECT m.body FROM reservation_message m
                          JOIN reservation r ON r.id = m.reservation_id
                         WHERE r.reference = :reference
                         ORDER BY m.created_at DESC, m.id DESC
                         LIMIT 1
                        """)
                .param("reference", reference)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /**
     * Whether the newest message on a reservation was written by automation.
     *
     * <p>Reads {@code automation_key IS NOT NULL} — the same column the UNIQUE
     * index is built on, so the test is asserting on the mechanism rather than
     * on a flag that could drift from it.
     */
    public boolean lastMessageIsAutomated(String reference) {
        return Boolean.TRUE.equals(jdbc.sql("""
                        SELECT m.automation_key IS NOT NULL FROM reservation_message m
                          JOIN reservation r ON r.id = m.reservation_id
                         WHERE r.reference = :reference
                         ORDER BY m.created_at DESC, m.id DESC
                         LIMIT 1
                        """)
                .param("reference", reference)
                .query(Boolean.class)
                .optional()
                .orElse(false));
    }

    /**
     * Attempts a second automated message with the SAME automation key.
     *
     * <p>Written straight at the table on purpose: it bypasses the sweep's
     * {@code NOT EXISTS} pre-check so the assertion is about
     * {@code reservation_message_automation_key_uk} and nothing else. Drop that
     * index and this returns true while every sweep-level test still passes,
     * which is exactly the regression worth catching.
     *
     * @return false when the database refused it — the guarantee working
     */
    public boolean insertDuplicateAutomatedMessage(String reference) {
        try {
            jdbc.sql("""
                            INSERT INTO reservation_message
                                (reservation_id, body, locale, template_id, automation_key)
                            SELECT m.reservation_id, m.body, m.locale, m.template_id,
                                   m.automation_key
                              FROM reservation_message m
                              JOIN reservation r ON r.id = m.reservation_id
                             WHERE r.reference = :reference AND m.automation_key IS NOT NULL
                             LIMIT 1
                            """)
                    .param("reference", reference)
                    .update();
            return true;
        } catch (org.springframework.dao.DuplicateKeyException refused) {
            return false;
        }
    }

    /** Whether a template row still exists — for the delete test. */
    public boolean templateExists(java.util.UUID id) {
        return Boolean.TRUE.equals(jdbc.sql("SELECT EXISTS (SELECT 1 FROM message_template WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single());
    }

    public String stayStatusOf(String reference) {
        return jdbc.sql("SELECT stay_status::text FROM reservation WHERE reference = :reference")
                .param("reference", reference)
                .query(String.class)
                .single();
    }
}
