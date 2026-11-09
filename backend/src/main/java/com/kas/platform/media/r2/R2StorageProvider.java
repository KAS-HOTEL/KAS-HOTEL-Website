package com.kas.platform.media.r2;

import com.kas.platform.media.DeliveryUrlStorageProvider;
import com.kas.platform.media.StorageProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Cloudflare R2, behind the vendor-free {@link StorageProvider} port — OQ-106's
 * answer, ruled in Step 16A.49.
 *
 * <h2>Why this is the S3 client</h2>
 *
 * <p>R2 exposes the S3 API and doc 12 §4 names it <em>"Cloudflare R2 (S3 API)"</em>,
 * so there is no R2 SDK to add. The endpoint comes from configuration and the
 * region is fixed to {@code auto}, which is what R2 expects and which is not a
 * deployment choice anyone needs to make. <strong>This package is the only place
 * an {@code software.amazon.awssdk} type appears</strong> — doc 12 §3 confines
 * vendor SDKs to adapters, and nothing above this class knows a bucket exists.
 *
 * <h2>Path-style addressing</h2>
 *
 * <p>Forced on: R2's S3 endpoint is {@code {account}.r2.cloudflarestorage.com}
 * and virtual-host style would put the bucket in the hostname of a domain the
 * deployment does not control.
 *
 * <h2>Delivery is not this class's job</h2>
 *
 * <p>{@link #deliveryUrl} delegates to {@link DeliveryUrlStorageProvider}, which
 * already composes {@code {base}/m/{assetId}} and knows nothing about R2. The
 * bucket is reachable only through signed URLs and whatever public base the
 * deployment points at it; guests are never sent to the S3 endpoint, and the
 * bucket is never listed.
 *
 * <h2>When R2 is not configured</h2>
 *
 * <p>This bean does not exist. {@link DeliveryUrlStorageProvider} remains the
 * only {@link StorageProvider}, delivery URLs keep working for anything already
 * stored, and the first upload attempt fails loudly naming
 * {@code kas.media.r2.bucket} — the same fail-loud pattern the JWT signing
 * secret and the delivery base use.
 *
 * <p>The condition is an expression rather than {@code @ConditionalOnProperty}
 * because {@code application.yml} binds the bucket to {@code ${KAS_R2_BUCKET:}}:
 * on an unconfigured deployment the property is <em>present and empty</em>, which
 * {@code @ConditionalOnProperty} counts as a match. Empty has to mean absent
 * here, or an unconfigured environment would build an S3 client with blank
 * credentials and fail at the first upload rather than never claiming to have
 * storage at all.
 */
@Component
@Primary
@ConditionalOnExpression("'${kas.media.r2.bucket:}'.length() > 0")
public class R2StorageProvider implements StorageProvider {

    /**
     * R2 ignores the region but the S3 client requires one, and {@code auto} is
     * the value Cloudflare documents. Not configurable: making it so would invite
     * a deployment to set something that changes nothing.
     */
    private static final Region R2_REGION = Region.of("auto");

    private final DeliveryUrlStorageProvider delivery;
    private final R2Properties properties;
    private final S3Client client;
    private final S3Presigner presigner;

    public R2StorageProvider(DeliveryUrlStorageProvider delivery, R2Properties properties) {
        this.delivery = delivery;
        this.properties = properties;

        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey()));
        URI endpoint = URI.create(properties.endpoint());
        S3Configuration pathStyle = S3Configuration.builder().pathStyleAccessEnabled(true).build();

        this.client = S3Client.builder()
                .endpointOverride(endpoint)
                .region(R2_REGION)
                .credentialsProvider(credentials)
                .serviceConfiguration(pathStyle)
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(endpoint)
                .region(R2_REGION)
                .credentialsProvider(credentials)
                .serviceConfiguration(pathStyle)
                .build();
    }

    @Override
    public String deliveryUrl(UUID assetId) {
        // The public URL has nothing to do with the bucket: doc 62 §6 forbids
        // exposing the provider at all, so a guest is sent to the delivery base
        // and never to an S3 endpoint.
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

    /**
     * Mints the doc 62 §4 step 1 upload URL.
     *
     * <p>The signature covers the key and the content type. A browser that
     * changes either gets a signature mismatch from R2, so one minted URL cannot
     * be turned into a write against a different asset or used to store a file
     * type that was never declared.
     */
    @Override
    public PresignedUpload presignedUpload(String storageKey, String contentType) {
        PutObjectRequest put = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(storageKey)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest request = PutObjectPresignRequest.builder()
                .signatureDuration(properties.presignTtl())
                .putObjectRequest(put)
                .build();

        var presigned = presigner.presignPutObject(request);
        return new PresignedUpload(presigned.url().toString(), presigned.expiration());
    }

    @Override
    public Optional<StoredObject> head(String storageKey) {
        try {
            HeadObjectResponse response = client.headObject(HeadObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(storageKey)
                    .build());
            return Optional.of(new StoredObject(
                    response.contentLength(),
                    response.contentType(),
                    normaliseETag(response.eTag())));
        } catch (NoSuchKeyException absent) {
            return Optional.empty();
        } catch (S3Exception failure) {
            // R2 answers HEAD on a missing key with a bodyless 404, which the SDK
            // does not always map to NoSuchKeyException.
            if (failure.statusCode() == 404) {
                return Optional.empty();
            }
            throw failure;
        }
    }

    /**
     * A ranged read of the first bytes — the magic-byte check of doc 62 §4.
     *
     * <p>{@code bytes=0-n} rather than a full {@code GetObject}: the point is to
     * look at a file header, and downloading a whole photograph to read eight
     * bytes of it would put image bytes on a path doc 62 §4 keeps them off.
     */
    @Override
    public Optional<byte[]> readHeader(String storageKey, int byteCount) {
        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(properties.bucket())
                .key(storageKey)
                .range("bytes=0-" + (byteCount - 1))
                .build();

        try (ResponseInputStream<GetObjectResponse> stream = client.getObject(request)) {
            return Optional.of(stream.readAllBytes());
        } catch (NoSuchKeyException absent) {
            return Optional.empty();
        } catch (S3Exception failure) {
            if (failure.statusCode() == 404) {
                return Optional.empty();
            }
            throw failure;
        } catch (IOException failure) {
            throw new IllegalStateException("Could not read the stored object header.", failure);
        }
    }

    @Override
    public void delete(String storageKey) {
        client.deleteObject(DeleteObjectRequest.builder()
                .bucket(properties.bucket())
                .key(storageKey)
                .build());
    }

    /**
     * Puts bytes directly — <strong>not part of the upload flow</strong>.
     *
     * <p>Doc 62 §4 keeps user uploads on the browser-to-storage path and this
     * method is not reachable from any route. It exists so an operator running a
     * doc 62 §3 folder import, or a maintainer verifying a deployment's
     * credentials, has a supported way in rather than a reason to widen the
     * upload endpoint.
     */
    public void put(String storageKey, String contentType, byte[] bytes) {
        client.putObject(PutObjectRequest.builder()
                        .bucket(properties.bucket())
                        .key(storageKey)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromBytes(bytes));
    }

    /**
     * S3 quotes the ETag; the quotes are not part of the value.
     *
     * <p>For a single-part upload this is the MD5 of the object, which is what
     * doc 62 §4's checksum idempotency compares. For a multipart upload it is
     * not, and the caller is told as much by it simply differing — no attempt is
     * made here to guess which kind it is.
     */
    private static String normaliseETag(String eTag) {
        if (eTag == null) {
            return null;
        }
        return eTag.replace("\"", "");
    }
}
