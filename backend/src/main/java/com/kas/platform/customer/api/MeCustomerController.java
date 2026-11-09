package com.kas.platform.customer.api;

import com.kas.platform.security.CurrentActor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;

/** Minimal customer-facing profile read used to hydrate the member header. */
@RestController
@RequestMapping("/api/v1/me/profile")
@PreAuthorize("isAuthenticated()")
public class MeCustomerController {
    private final JdbcClient jdbc;

    public MeCustomerController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Profile profile() {
        UUID userId = CurrentActor.require().userId();
        return jdbc.sql("""
                SELECT c.full_name, c.email::text AS email, c.phone, c.locale, c.country AS nationality,
                       mt.code AS tier, COALESCE(ca.balance_points, 0) AS points, av.version AS avatar_version
                  FROM customer c
                  LEFT JOIN customer_avatar av ON av.customer_id = c.id
                  LEFT JOIN customer_membership cm ON cm.customer_id = c.id AND cm.status = 'ACTIVE'
                  LEFT JOIN customer_membership_tier_history mth
                         ON mth.membership_id = cm.id AND mth.effective_to IS NULL
                  LEFT JOIN membership_tier mt ON mt.id = mth.tier_id
                  LEFT JOIN cashback_account ca ON ca.customer_id = c.id
                 WHERE c.user_id = :user
                """)
                .param("user", userId)
                .query((rs, row) -> new Profile(rs.getString("full_name"), rs.getString("email"),
                        rs.getString("phone"), rs.getString("locale"), rs.getString("nationality"), rs.getString("tier"),
                        rs.getLong("points"), avatarUrl((Integer) rs.getObject("avatar_version"))))
                .optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Customer profile not found"));
    }

    @PutMapping
    public Profile update(@Valid @RequestBody UpdateProfile request) {
        UUID userId = CurrentActor.require().userId();
        int changed = jdbc.sql("""
                UPDATE customer SET full_name = :name, phone = :phone, country = :nationality,
                                    updated_at = now()
                 WHERE user_id = :user
                """)
                .param("name", request.fullName().trim())
                .param("phone", request.phone().trim())
                .param("nationality", request.nationality().trim())
                .param("user", userId)
                .update();
        if (changed != 1) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "Customer profile not found");
        }
        return profile();
    }

    public record UpdateProfile(@NotBlank @Size(max = 200) String fullName,
                                @NotBlank @Size(min = 3, max = 32) String phone,
                                @NotBlank @Pattern(regexp = "[A-Z]{2}") String nationality) {}

    /**
     * The profile photo, replaced whole. The website resizes the image before
     * upload; the server still checks the declared type against the file's own
     * signature and enforces the size limit (also a database constraint).
     */
    @PutMapping("/avatar")
    public Profile updateAvatar(@Valid @RequestBody AvatarUpload request) {
        UUID userId = CurrentActor.require().userId();
        Avatar avatar = decode(request.image());
        int changed = jdbc.sql("""
                INSERT INTO customer_avatar (customer_id, content_type, image)
                SELECT c.id, :type, :image FROM customer c WHERE c.user_id = :user
                ON CONFLICT (customer_id) DO UPDATE
                   SET content_type = EXCLUDED.content_type, image = EXCLUDED.image,
                       version = customer_avatar.version + 1, updated_at = now()
                """)
                .param("type", avatar.contentType()).param("image", avatar.bytes()).param("user", userId)
                .update();
        if (changed != 1) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "Customer profile not found");
        }
        return profile();
    }

    /** Removes the photo; the site falls back to the member's initial. */
    @org.springframework.web.bind.annotation.DeleteMapping("/avatar")
    public Profile deleteAvatar() {
        UUID userId = CurrentActor.require().userId();
        jdbc.sql("DELETE FROM customer_avatar WHERE customer_id = (SELECT id FROM customer WHERE user_id = :user)")
                .param("user", userId).update();
        return profile();
    }

    /** The caller's own photo. The URL carries the version, so it may be cached privately. */
    @GetMapping("/avatar")
    public org.springframework.http.ResponseEntity<byte[]> avatar() {
        UUID userId = CurrentActor.require().userId();
        return jdbc.sql("""
                SELECT av.content_type, av.image FROM customer_avatar av
                  JOIN customer c ON c.id = av.customer_id WHERE c.user_id = :user
                """)
                .param("user", userId)
                .query((rs, n) -> imageResponse(rs.getString("content_type"), rs.getBytes("image")))
                .optional()
                .orElseGet(() -> org.springframework.http.ResponseEntity.notFound().build());
    }

    static org.springframework.http.ResponseEntity<byte[]> imageResponse(String contentType, byte[] image) {
        return org.springframework.http.ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(contentType))
                .cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofDays(30)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(image);
    }

    private static String avatarUrl(Integer version) {
        return version == null ? null : "/api/v1/me/profile/avatar?v=" + version;
    }

    static final int MAX_AVATAR_BYTES = 524_288;

    /** {@code data:image/<type>;base64,<data>} → bytes, refusing anything that is not that image type. */
    static Avatar decode(String dataUrl) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\\s]+)$").matcher(dataUrl.trim());
        if (!m.matches()) {
            throw invalidImage();
        }
        byte[] bytes;
        try {
            bytes = java.util.Base64.getMimeDecoder().decode(m.group(2));
        } catch (IllegalArgumentException malformed) {
            throw invalidImage();
        }
        if (bytes.length == 0 || bytes.length > MAX_AVATAR_BYTES || !signatureMatches(m.group(1), bytes)) {
            throw invalidImage();
        }
        return new Avatar(m.group(1), bytes);
    }

    private static boolean signatureMatches(String type, byte[] b) {
        return switch (type) {
            case "image/jpeg" -> b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
            case "image/png" -> b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
            case "image/webp" -> b.length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                    && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
            default -> false;
        };
    }

    private static com.kas.platform.shared.KasException invalidImage() {
        return new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.VALIDATION_FAILED,
                "The photo must be a JPEG, PNG or WebP image of at most 512 KB.");
    }

    record Avatar(String contentType, byte[] bytes) { }

    /** ~700 KB of base64 is the 512 KB image limit plus encoding overhead. */
    public record AvatarUpload(@NotBlank @Size(max = 720_000) String image) {}

    public record Profile(String fullName, String email, String phone,
                          String locale, String nationality, String tier, long points, String avatarUrl) {}
}
