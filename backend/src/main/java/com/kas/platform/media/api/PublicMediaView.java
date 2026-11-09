package com.kas.platform.media.api;

/**
 * A media asset as a guest sees it — the public shape of doc 62 §6.
 *
 * <p><strong>Absent, and unable to be present:</strong> {@code storageKey},
 * bucket, region, provider, original path, {@code checksum},
 * {@code uploadedBy}, {@code partnerId}, and the link's internal state. Doc 62
 * §6 lists those as never-public and doc 58 §9 denylists them; this type has no
 * field for any of them, so the guarantee is structural rather than a filter
 * someone has to remember.
 *
 * <p>{@code url} is produced by the {@code StorageProvider} port from the opaque
 * asset id. Doc 62 §6 explicitly permits "the opaque asset ID" to be public while
 * the storage key is not.
 *
 * <p>{@code srcset} from doc 62 §6's example is not included: responsive
 * derivatives require a transformation pipeline that belongs to whichever
 * provider is eventually chosen (OQ-106). Width and height are returned so a
 * client can reserve layout space without it.
 */
public record PublicMediaView(
        String url,
        Integer width,
        Integer height,
        String alt,
        String caption,
        boolean isCover,
        /** The gallery category (EXTERIOR, LOBBY, ROOM, DINING, FACILITY, …); the website groups photos by it. */
        String category) {
}
