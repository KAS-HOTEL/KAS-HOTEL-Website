package com.kas.platform.media;

import com.kas.platform.shared.MissingConfigurationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Resolves delivery URLs from a configured base, with no vendor SDK.
 *
 * <p>This is the smallest adapter that satisfies the {@link StorageProvider}
 * port without choosing a provider. It composes {@code {base}/m/{assetId}} — the
 * shape doc 62 §6 sketches — and knows nothing about buckets, regions or
 * signing. Whichever CDN or object store eventually sits behind that base is a
 * deployment decision, not a code change.
 *
 * <p>{@code kas.media.delivery-base-url} has <strong>no default</strong>. An
 * unset base makes {@link #deliveryUrl} raise {@code CONFIG_MISSING} naming the
 * property, and readiness reports DOWN — the same fail-loud pattern the JWT
 * signing secret uses. A default would be worse than useless: it would emit URLs
 * that resolve to nothing, to guests.
 */
@Component
public class DeliveryUrlStorageProvider implements StorageProvider {

    static final String PROPERTY = "kas.media.delivery-base-url";

    private final String deliveryBaseUrl;

    public DeliveryUrlStorageProvider(
            @Value("${kas.media.delivery-base-url:}") String deliveryBaseUrl) {
        this.deliveryBaseUrl = deliveryBaseUrl;
    }

    @Override
    public String deliveryUrl(UUID assetId) {
        if (!isConfigured()) {
            throw new MissingConfigurationException(PROPERTY);
        }
        String base = deliveryBaseUrl.endsWith("/")
                ? deliveryBaseUrl.substring(0, deliveryBaseUrl.length() - 1)
                : deliveryBaseUrl;
        // The opaque asset id, never the storage key — doc 62 §6.
        return base + "/m/" + assetId;
    }

    @Override
    public boolean isConfigured() {
        return deliveryBaseUrl != null && !deliveryBaseUrl.isBlank();
    }
}
