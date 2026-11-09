/**
 * Media assets and their attachment to properties and room types.
 *
 * <p>Doc 62 §2: one central library. An asset uploaded once appears in several
 * galleries "without duplication" — {@code media_asset} holds the file,
 * {@code media_link} attaches it to an owner with an order and a cover flag.
 *
 * <p>Doc 62 §6 is absolute about the boundary: {@code storage_key}, bucket,
 * region and provider are internal and never leave the server; customers receive
 * a resolved delivery URL. That resolution sits behind a {@link
 * com.kas.platform.media.StorageProvider} port, exactly as doc 62 §6 specifies,
 * so changing vendor changes one adapter and no URL a guest bookmarked.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Media",
        allowedDependencies = {"shared", "partner", "property", "identity", "audit", "security", "web"})
package com.kas.platform.media;
