package com.kas.platform.security.it;

import com.kas.platform.media.DeliveryUrlStorageProvider;
import com.kas.platform.media.StorageProvider;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * An in-memory {@link StorageProvider} for the upload tests.
 *
 * <h2>Why a fake and not an emulator</h2>
 *
 * <p>The brief rules out standing up LocalStack or MinIO for convenience, and it
 * is right to: what these tests need to prove is that the <em>media flow</em>
 * behaves — scope, magic bytes, type agreement, checksum idempotency, the status
 * staying {@code DRAFT} — and none of that is a property of S3. Real R2 needs
 * credentials CI must not hold.
 *
 * <p>What this deliberately does <strong>not</strong> prove is that the AWS SDK
 * is wired correctly against R2. That is what
 * {@code R2StorageProviderTest} checks at the adapter's own boundary, and what
 * the browser E2E exercises end to end.
 *
 * <p>It behaves like storage in the ways the flow depends on: an object exists
 * only once written, {@code head} reports the bytes actually stored rather than
 * what anyone declared, and the checksum is a real digest of the content so the
 * deduplication path is exercised by identical bytes rather than by a stubbed
 * equality.
 */
@TestConfiguration
class FakeObjectStorage {

    @Bean
    @Primary
    StorageProvider fakeStorageProvider(DeliveryUrlStorageProvider delivery) {
        return new InMemory(delivery);
    }

    /** The bean, exposed so a test can put bytes where a browser would have. */
    static final class InMemory implements StorageProvider {

        private final DeliveryUrlStorageProvider delivery;
        private final Map<String, Stored> objects = new LinkedHashMap<>();
        private final Map<String, Instant> signed = new LinkedHashMap<>();

        InMemory(DeliveryUrlStorageProvider delivery) {
            this.delivery = delivery;
        }

        @Override
        public String deliveryUrl(UUID assetId) {
            return delivery.deliveryUrl(assetId);
        }

        @Override
        public boolean isConfigured() {
            return delivery.isConfigured();
        }

        @Override
        public boolean canTransfer() {
            return true;
        }

        @Override
        public PresignedUpload presignedUpload(String storageKey, String contentType) {
            Instant expiry = Instant.now().plus(Duration.ofMinutes(10));
            signed.put(storageKey, expiry);
            // Shaped like a signed URL — a host, the key as a path, and a query
            // that expires — so a test can assert the key is not guessable and
            // that no credential is embedded.
            return new PresignedUpload(
                    "https://storage.invalid/" + storageKey + "?X-Amz-Expires=600", expiry);
        }

        @Override
        public Optional<StoredObject> head(String storageKey) {
            return Optional.ofNullable(objects.get(storageKey))
                    .map(stored -> new StoredObject(
                            stored.bytes.length, stored.contentType, checksumOf(stored.bytes)));
        }

        @Override
        public Optional<byte[]> readHeader(String storageKey, int byteCount) {
            return Optional.ofNullable(objects.get(storageKey)).map(stored -> {
                int length = Math.min(byteCount, stored.bytes.length);
                byte[] header = new byte[length];
                System.arraycopy(stored.bytes, 0, header, 0, length);
                return header;
            });
        }

        @Override
        public void delete(String storageKey) {
            objects.remove(storageKey);
        }

        /** What the browser's direct PUT would have done. */
        void put(String storageKey, String contentType, byte[] bytes) {
            objects.put(storageKey, new Stored(contentType, bytes));
        }

        boolean has(String storageKey) {
            return objects.containsKey(storageKey);
        }

        boolean wasSigned(String storageKey) {
            return signed.containsKey(storageKey);
        }

        void reset() {
            objects.clear();
            signed.clear();
        }

        /** A real digest, so identical bytes really do collide and differing bytes do not. */
        private static String checksumOf(byte[] bytes) {
            try {
                byte[] digest = java.security.MessageDigest.getInstance("MD5").digest(bytes);
                StringBuilder hex = new StringBuilder(digest.length * 2);
                for (byte b : digest) {
                    hex.append("%02x".formatted(b));
                }
                return hex.toString();
            } catch (java.security.NoSuchAlgorithmException impossible) {
                throw new IllegalStateException(impossible);
            }
        }

        private record Stored(String contentType, byte[] bytes) {
        }
    }
}
