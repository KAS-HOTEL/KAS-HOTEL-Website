package com.kas.platform.media.local;

import com.kas.platform.media.StorageProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Object storage on a disk of the backend's own — local development, and production on a
 * Render persistent disk until object storage is set up (owner decision 2026-11-08).
 *
 * <p>Built only when both hold:
 * <ul>
 *   <li>{@code kas.media.local.dir} is set — {@code application-dev.yml} defaults it to
 *       {@code ~/kas-media}; production sets {@code KAS_MEDIA_LOCAL_DIR} to the disk's mount
 *       path in {@code render.yaml}; tests leave it empty;</li>
 *   <li>{@code kas.media.r2.bucket} is empty — a configured R2 always wins.</li>
 * </ul>
 *
 * <p>It keeps the R2 flow's shape so {@code MediaService} is unchanged: the "pre-signed"
 * URL is a same-origin path on {@link LocalMediaController}, signed with an HMAC secret
 * created at startup, binding the key, the content type and an expiry. Images are served
 * from {@code /api/v1/public/local-media/m/{assetId}}, which the console and the website
 * both forward to the backend.
 *
 * <p>One disk means one backend instance: the files and the signing secret live on it and in
 * it. Moving to R2 later is setting the {@code KAS_R2_*} variables and copying the files.
 */
@Component
@Primary
@ConditionalOnExpression("'${kas.media.local.dir:}'.length() > 0 && '${kas.media.r2.bucket:}'.length() == 0")
public class LocalDiskStorageProvider implements StorageProvider {

    static final String BASE_PATH = "/api/v1/public/local-media";
    static final long MAX_BYTES = 30L * 1024 * 1024;
    private static final Duration UPLOAD_TTL = Duration.ofMinutes(10);
    private static final Pattern SAFE_KEY = Pattern.compile("[A-Za-z0-9/_.-]{1,200}");

    private final Path root;
    private final byte[] secret = new byte[32];

    public LocalDiskStorageProvider(@Value("${kas.media.local.dir}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
        new SecureRandom().nextBytes(secret);
        try {
            Files.createDirectories(root);
        } catch (IOException failure) {
            // Never stop the whole API over the image store: log it, and let uploads fail
            // (each one names the problem) while everything else keeps serving.
            LOG.error("Image directory {} is not usable; uploads will fail until it is.", root, failure);
        }
    }

    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(LocalDiskStorageProvider.class);

    @Override
    public String deliveryUrl(UUID assetId) {
        return BASE_PATH + "/m/" + assetId;
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    @Override
    public boolean canTransfer() {
        return true;
    }

    @Override
    public PresignedUpload presignedUpload(String storageKey, String contentType) {
        Instant expires = Instant.now().plus(UPLOAD_TTL);
        long exp = expires.getEpochSecond();
        String url = BASE_PATH + "/upload?key=" + encode(storageKey)
                + "&type=" + encode(contentType)
                + "&exp=" + exp
                + "&sig=" + sign(storageKey, contentType, exp);
        return new PresignedUpload(url, expires);
    }

    @Override
    public Optional<StoredObject> head(String storageKey) {
        Path file = fileOf(storageKey);
        if (!Files.isRegularFile(file)) return Optional.empty();
        try {
            String type = Files.readString(typeFileOf(storageKey), StandardCharsets.UTF_8).trim();
            return Optional.of(new StoredObject(Files.size(file), type, md5(file)));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    @Override
    public Optional<byte[]> readHeader(String storageKey, int byteCount) {
        Path file = fileOf(storageKey);
        if (!Files.isRegularFile(file)) return Optional.empty();
        try (InputStream in = Files.newInputStream(file)) {
            return Optional.of(in.readNBytes(byteCount));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            Files.deleteIfExists(fileOf(storageKey));
            Files.deleteIfExists(typeFileOf(storageKey));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    /** True when the signature matches and has not expired. */
    boolean verify(String storageKey, String contentType, long exp, String sig) {
        if (exp < Instant.now().getEpochSecond()) return false;
        byte[] expected = sign(storageKey, contentType, exp).getBytes(StandardCharsets.US_ASCII);
        byte[] given = (sig == null ? "" : sig).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, given);
    }

    /** Writes an upload, refusing anything larger than {@link #MAX_BYTES}. */
    void store(String storageKey, String contentType, InputStream body) throws IOException {
        Path file = fileOf(storageKey);
        Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(root, "upload-", ".part");
        try {
            try (InputStream limited = body) {
                long written = 0;
                byte[] buffer = new byte[64 * 1024];
                try (var out = Files.newOutputStream(temp)) {
                    int read;
                    while ((read = limited.read(buffer)) != -1) {
                        written += read;
                        if (written > MAX_BYTES) throw new IllegalArgumentException("too large");
                        out.write(buffer, 0, read);
                    }
                }
            }
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            Files.writeString(typeFileOf(storageKey), contentType, StandardCharsets.UTF_8);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    Path fileOf(String storageKey) {
        if (storageKey == null || !SAFE_KEY.matcher(storageKey).matches() || storageKey.contains("..")) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        Path file = root.resolve(storageKey).normalize();
        if (!file.startsWith(root)) throw new IllegalArgumentException("Invalid storage key");
        return file;
    }

    private Path typeFileOf(String storageKey) {
        return fileOf(storageKey + ".type");
    }

    private String sign(String storageKey, String contentType, long exp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] digest = mac.doFinal((storageKey + "\n" + contentType + "\n" + exp)
                    .getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static String md5(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            try (InputStream in = Files.newInputStream(file)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
