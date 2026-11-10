package com.kas.platform.shared;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * The stylesheet of the small HTML pages a hotel or guest opens from an email link
 * ({@code /api/v1/public/reservation-actions/**}), and the Content-Security-Policy
 * that lets exactly this stylesheet run.
 *
 * <p>The API's default policy is {@code default-src 'none'}, which rendered these pages
 * unstyled (KAS-017). Rather than allowing any inline style, the policy for this path
 * names the SHA-256 of this one {@code <style>} block, so nothing else can style or
 * script the page.
 */
public final class EmailActionPageStyle {

    /** Ant-style path of the email action pages. */
    public static final String PATH_PATTERN = "/api/v1/public/reservation-actions/**";

    public static final String CSS = """
            *{box-sizing:border-box}body{margin:0;background:#f5f1e9;color:#29251f;font:16px/1.6 Arial,Helvetica,sans-serif;padding:8vh 16px}\
            main{max-width:620px;margin:0 auto;background:#fffdf9;padding:36px;border:1px solid #d9cfbf}\
            .brand{margin:0 0 18px;letter-spacing:.22em;font-size:12px;color:#9a7948}\
            h1{margin:0 0 14px;font:400 30px/1.25 'Times New Roman',Georgia,serif}h2{margin:28px 0 10px;font:400 22px 'Times New Roman',Georgia,serif}\
            p{margin:0 0 14px}.muted{color:#6b6255;font-size:14px}.facts{margin:0 0 20px;padding:14px 16px;background:#f5f1e9;border-left:3px solid #c2a25c}\
            .error{border-left-color:#a33a2b}button{appearance:none;border:0;background:#1f1b16;color:#fff;padding:14px 22px;font:600 14px Arial,sans-serif;letter-spacing:.04em;cursor:pointer;width:100%;max-width:360px}\
            button.secondary{background:#fff;color:#1f1b16;border:1px solid #1f1b16}form{margin:0 0 12px}\
            label{display:block;margin:0 0 12px;font-size:14px}input,textarea{display:block;width:100%;margin-top:4px;padding:10px;border:1px solid #cfc5b4;font:15px Arial,sans-serif;background:#fff}\
            hr{border:0;border-top:1px solid #e3dacb;margin:28px 0}a{color:#7a5c2e}@media(max-width:480px){main{padding:24px}h1{font-size:25px}}""";

    public static final String CONTENT_SECURITY_POLICY = "default-src 'none'; style-src '" + sha256(CSS) + "'; "
            + "frame-ancestors 'none'; base-uri 'none'; "
            // The guest payment page posts its signed checkout form to SePay.
            + "form-action 'self' https://pay.sepay.vn https://pay-sandbox.sepay.vn";

    private EmailActionPageStyle() {
    }

    private static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return "sha256-" + Base64.getEncoder().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
