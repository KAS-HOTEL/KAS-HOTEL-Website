package com.kas.platform.media.local;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LocalDiskStorageProviderTest {

    @TempDir
    Path dir;

    @Test
    void storesAndReadsBackAnUpload() throws Exception {
        LocalDiskStorageProvider storage = new LocalDiskStorageProvider(dir.toString());
        String key = "m/" + UUID.randomUUID();
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x01, 0x02};

        storage.store(key, "image/jpeg", new ByteArrayInputStream(jpeg));

        var head = storage.head(key).orElseThrow();
        assertThat(head.sizeBytes()).isEqualTo(5);
        assertThat(head.contentType()).isEqualTo("image/jpeg");
        assertThat(head.checksum()).hasSize(32);
        assertThat(storage.readHeader(key, 3).orElseThrow()).containsExactly(0xFF, 0xD8, 0xFF);

        storage.delete(key);
        assertThat(storage.head(key)).isEmpty();
    }

    @Test
    void signedUrlBindsKeyTypeAndExpiry() {
        LocalDiskStorageProvider storage = new LocalDiskStorageProvider(dir.toString());
        String url = storage.presignedUpload("m/abc", "image/png").url();
        Map<String, String> q = query(url);

        assertThat(url).startsWith("/api/v1/public/local-media/upload?");
        long exp = Long.parseLong(q.get("exp"));
        assertThat(storage.verify("m/abc", "image/png", exp, q.get("sig"))).isTrue();
        assertThat(storage.verify("m/other", "image/png", exp, q.get("sig"))).isFalse();
        assertThat(storage.verify("m/abc", "image/jpeg", exp, q.get("sig"))).isFalse();
        assertThat(storage.verify("m/abc", "image/png", 1L, q.get("sig"))).isFalse();
    }

    @Test
    void refusesKeysOutsideTheDirectory() {
        LocalDiskStorageProvider storage = new LocalDiskStorageProvider(dir.toString());
        assertThatThrownBy(() -> storage.fileOf("../secret")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.fileOf("m/../../x")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.fileOf("C:\\x")).isInstanceOf(IllegalArgumentException.class);
    }

    private static Map<String, String> query(String url) {
        Map<String, String> out = new HashMap<>();
        for (String pair : url.substring(url.indexOf('?') + 1).split("&")) {
            String[] kv = pair.split("=", 2);
            out.put(kv[0], URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
        }
        return out;
    }
}
