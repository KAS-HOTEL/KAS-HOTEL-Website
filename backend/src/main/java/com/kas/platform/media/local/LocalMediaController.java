package com.kas.platform.media.local;

import com.kas.platform.security.PublicEndpoint;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * The byte endpoints of {@link LocalDiskStorageProvider}, built under exactly the same
 * conditions as that provider.
 *
 * <p>{@code PUT /upload} stands in for an R2 pre-signed URL: the HMAC signature in the
 * query is the authority, as it is for R2, and the declared content type must match the
 * one it signed. {@code GET /m/{assetId}} serves a stored image.
 */
@RestController
@RequestMapping(LocalDiskStorageProvider.BASE_PATH)
@ConditionalOnExpression("'${kas.media.local.dir:}'.length() > 0 && '${kas.media.r2.bucket:}'.length() == 0")
public class LocalMediaController {

    private final LocalDiskStorageProvider storage;
    private final JdbcClient jdbc;

    public LocalMediaController(LocalDiskStorageProvider storage, JdbcClient jdbc) {
        this.storage = storage;
        this.jdbc = jdbc;
    }

    @PutMapping("/upload")
    @PublicEndpoint(reason = "Disk image store upload (stand-in for an R2 pre-signed URL); the HMAC signature authorises it")
    public ResponseEntity<Void> upload(@RequestParam String key, @RequestParam String type,
                                       @RequestParam long exp, @RequestParam String sig,
                                       HttpServletRequest request) throws IOException {
        if (!storage.verify(key, type, exp, sig)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        String declared = request.getContentType();
        if (declared == null || !declared.split(";")[0].trim().equalsIgnoreCase(type)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (request.getContentLengthLong() > LocalDiskStorageProvider.MAX_BYTES) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
        }
        try {
            storage.store(key, type, request.getInputStream());
        } catch (IllegalArgumentException refused) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/m/{assetId}")
    @PublicEndpoint(reason = "Disk image store delivery: public website and console images")
    public ResponseEntity<Resource> image(@PathVariable UUID assetId) {
        Map<String, Object> row = jdbc.sql("SELECT storage_key, mime_type FROM media_asset WHERE id = :id")
                .param("id", assetId)
                .query()
                .listOfRows()
                .stream().findFirst().orElse(null);
        if (row == null || row.get("storage_key") == null) return ResponseEntity.notFound().build();
        Path file;
        try {
            file = storage.fileOf((String) row.get("storage_key"));
        } catch (IllegalArgumentException invalid) {
            return ResponseEntity.notFound().build();
        }
        if (!Files.isRegularFile(file)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType((String) row.get("mime_type")))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable())
                .body(new FileSystemResource(file));
    }
}
