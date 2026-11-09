package com.kas.platform.media.r2;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Cloudflare R2 connection settings — {@code kas.media.r2.*}.
 *
 * <p>Every value is environment-specific and <strong>none has a default that
 * could reach production</strong>: {@code application.yml} binds them to
 * {@code KAS_R2_*} environment variables with empty fallbacks, so an
 * unconfigured deployment simply has no {@link R2StorageProvider} bean rather
 * than a half-configured one pointed at somebody else's bucket.
 *
 * <p>The secret is held as a plain {@code String} because that is what the SDK's
 * credentials provider takes. It is never logged, never returned by a route, and
 * never placed in an exception message — {@code MissingConfigurationException}
 * names the <em>property</em>, not its value.
 */
@ConfigurationProperties(prefix = "kas.media.r2")
public record R2Properties(

        /**
         * The account's S3 API endpoint, e.g.
         * {@code https://<account-id>.r2.cloudflarestorage.com}. Supplied by
         * deployment; the account id is not in this repository.
         */
        String endpoint,

        String accessKeyId,

        String secretAccessKey,

        /** The bucket. Its presence is what switches the adapter on. */
        String bucket,

        /**
         * How long a minted upload URL stays valid.
         *
         * <p>Ten minutes: long enough for a large photograph on a slow
         * connection, short enough that a URL captured from a log or a shared
         * screen is worthless by the time it is used. Doc 62 §4 says
         * "pre-signed" and gives no number, so this is a security default rather
         * than a contract value — configurable, and deliberately not hours.
         */
        @DefaultValue("PT10M") Duration presignTtl) {
}
