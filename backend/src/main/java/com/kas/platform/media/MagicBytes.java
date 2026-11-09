package com.kas.platform.media;

import java.util.Arrays;

/**
 * The magic-byte half of doc 62 §4's <em>"MIME <strong>and</strong> magic-byte
 * check; allowlist only"</em>.
 *
 * <p>A declared content type is a claim by whoever uploaded the file. The first
 * bytes are what the file actually is, and doc 62 §4 asks for both because a
 * {@code .jpg} that is really an HTML document is the oldest trick there is —
 * doc 62 §4 also says media is <em>"served from a separate origin; never
 * executable"</em>, and this is the check that keeps the two claims honest.
 *
 * <p><strong>Allowlist only.</strong> Anything not recognised is refused rather
 * than allowed through as "probably fine". The four types here are exactly the
 * ones {@code RegisterMediaRequest} accepts.
 */
final class MagicBytes {

    /** Enough for the longest signature checked here — AVIF's brand at 8..11. */
    static final int HEADER_BYTES = 16;

    private MagicBytes() {
    }

    /**
     * Whether the header is genuinely the declared type.
     *
     * <p>A header shorter than a signature is a failure, not a pass: a truncated
     * upload should not be accepted on the grounds that there was nothing to
     * disagree with.
     */
    static boolean matches(String mimeType, byte[] header) {
        if (header == null) {
            return false;
        }
        return switch (mimeType) {
            case "image/jpeg" -> startsWith(header, 0xFF, 0xD8, 0xFF);
            case "image/png" -> startsWith(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            // RIFF....WEBP — the four size bytes between the two markers are the
            // file length and carry no signature.
            case "image/webp" -> ascii(header, 0, "RIFF") && ascii(header, 8, "WEBP");
            // ISO-BMFF: a box length, then 'ftyp', then the brand. AVIF files are
            // branded avif (still) or avis (sequence).
            case "image/avif" -> ascii(header, 4, "ftyp")
                    && (ascii(header, 8, "avif") || ascii(header, 8, "avis"));
            default -> false;
        };
    }

    private static boolean startsWith(byte[] header, int... signature) {
        if (header.length < signature.length) {
            return false;
        }
        return Arrays.equals(
                header, 0, signature.length,
                toBytes(signature), 0, signature.length);
    }

    private static byte[] toBytes(int[] values) {
        byte[] bytes = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            bytes[i] = (byte) values[i];
        }
        return bytes;
    }

    private static boolean ascii(byte[] header, int offset, String expected) {
        if (header.length < offset + expected.length()) {
            return false;
        }
        for (int i = 0; i < expected.length(); i++) {
            if (header[offset + i] != (byte) expected.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}
