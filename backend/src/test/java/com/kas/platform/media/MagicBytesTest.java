package com.kas.platform.media;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Doc 62 §4's magic-byte check — <em>"MIME <strong>and</strong> magic-byte check;
 * allowlist only"</em>.
 *
 * <p>A unit test rather than an integration one: this is a pure function over
 * bytes, and the interesting cases are the malformed headers no upload would
 * conveniently produce.
 */
class MagicBytesTest {

    private static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            out[i] = (byte) values[i];
        }
        return out;
    }

    private static final byte[] PNG =
            bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R');
    private static final byte[] JPEG =
            bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1, 2, 3, 4, 5);
    private static final byte[] WEBP =
            bytes('R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' ');
    private static final byte[] AVIF =
            bytes(0, 0, 0, 0x1C, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f', 0, 0, 0, 0);

    @Test
    @DisplayName("each allowlisted type is recognised by its own signature")
    void recognisesEveryAcceptedType() {
        assertThat(MagicBytes.matches("image/png", PNG)).isTrue();
        assertThat(MagicBytes.matches("image/jpeg", JPEG)).isTrue();
        assertThat(MagicBytes.matches("image/webp", WEBP)).isTrue();
        assertThat(MagicBytes.matches("image/avif", AVIF)).isTrue();
    }

    @Test
    @DisplayName("an AVIF sequence brand is accepted too")
    void acceptsAvifSequences() {
        byte[] avis = bytes(0, 0, 0, 0x1C, 'f', 't', 'y', 'p', 'a', 'v', 'i', 's', 0, 0, 0, 0);
        assertThat(MagicBytes.matches("image/avif", avis)).isTrue();
    }

    @Test
    @DisplayName("bytes of one type do not pass as another")
    void doesNotConfuseTypes() {
        assertThat(MagicBytes.matches("image/png", JPEG)).isFalse();
        assertThat(MagicBytes.matches("image/jpeg", PNG)).isFalse();
        assertThat(MagicBytes.matches("image/webp", AVIF)).isFalse();
        assertThat(MagicBytes.matches("image/avif", WEBP)).isFalse();
    }

    @Test
    @DisplayName("an executable document renamed as an image is refused")
    void refusesAnHtmlDocument() {
        byte[] html = "<!doctype html><script>alert(1)</script>".getBytes(StandardCharsets.UTF_8);

        // The reason doc 62 §4 asks for both checks, and doc 10 §5.1 requires
        // nothing executable reaches a delivery origin.
        assertThat(MagicBytes.matches("image/png", html)).isFalse();
        assertThat(MagicBytes.matches("image/jpeg", html)).isFalse();
    }

    @Test
    @DisplayName("a truncated header fails rather than passing for want of evidence")
    void refusesTruncatedHeaders() {
        assertThat(MagicBytes.matches("image/png", bytes(0x89, 0x50))).isFalse();
        assertThat(MagicBytes.matches("image/webp", bytes('R', 'I', 'F', 'F'))).isFalse();
        assertThat(MagicBytes.matches("image/avif", bytes(0, 0, 0))).isFalse();
        assertThat(MagicBytes.matches("image/png", new byte[0])).isFalse();
    }

    @Test
    @DisplayName("a missing header is a failure, not a pass")
    void refusesNull() {
        assertThat(MagicBytes.matches("image/png", null)).isFalse();
    }

    @Test
    @DisplayName("a type outside the allowlist is refused whatever its bytes")
    void allowlistOnly() {
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes(StandardCharsets.UTF_8);

        // SVG is an XML document that can carry script; MediaService excludes it
        // from the type allowlist and this is the second lock on the same door.
        assertThat(MagicBytes.matches("image/svg+xml", svg)).isFalse();
        assertThat(MagicBytes.matches("image/gif", bytes('G', 'I', 'F', '8', '9', 'a'))).isFalse();
        assertThat(MagicBytes.matches("application/pdf", bytes('%', 'P', 'D', 'F'))).isFalse();
    }

    @Test
    @DisplayName("WEBP needs both markers, not just RIFF")
    void webpNeedsBothMarkers() {
        byte[] riffOnly =
                bytes('R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'A', 'V', 'I', ' ', 0, 0, 0, 0);

        // A RIFF container can hold audio or video; only the second marker says
        // it is a WebP image.
        assertThat(MagicBytes.matches("image/webp", riffOnly)).isFalse();
    }
}
