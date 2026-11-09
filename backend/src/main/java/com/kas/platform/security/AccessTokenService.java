package com.kas.platform.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.kas.platform.shared.MissingConfigurationException;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Issues and verifies the short-lived access token.
 *
 * <p>The token carries the user id as {@code sub} and the session id as
 * {@code sid}. It carries <strong>no permissions and no scope</strong>: those
 * are resolved from the database on every request, so revoking a role takes
 * effect immediately rather than at the next token expiry. A token that
 * enumerated permissions would be a snapshot of authority that outlives the
 * decision to grant it.
 *
 * <p>The {@code sid} claim is what makes doc 59 §8's "logout genuinely
 * invalidates" achievable with a self-contained token: the filter checks the
 * session row is still active before honouring the signature.
 */
@Service
public class AccessTokenService {

    private static final String ISSUER = "kas";
    private static final String SESSION_CLAIM = "sid";

    private final AuthenticationProperties properties;

    /** Built lazily: the secret is configuration and may legitimately be absent at startup. */
    private volatile NimbusJwtEncoder encoder;
    private volatile NimbusJwtDecoder decoder;

    public AccessTokenService(AuthenticationProperties properties) {
        this.properties = properties;
    }

    /**
     * @throws MissingConfigurationException naming the property, when the
     *         signing secret or the lifetime has not been configured. Doc 51 §6
     *         rule 2: fail loudly at the point of use, never default.
     */
    public String issue(UUID userId, UUID sessionId, Instant now) {
        requireConfigured();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .claim(SESSION_CLAIM, sessionId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTokenTtl()))
                .build();

        return encoder().encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    /**
     * Verifies signature and expiry.
     *
     * @return the identity carried by a valid token, or empty for any token that
     *         is malformed, unsigned, wrongly signed or expired. The caller is
     *         given no way to tell those apart.
     */
    public Optional<AccessTokenIdentity> verify(String token) {
        if (token == null || token.isBlank() || !properties.isComplete()) {
            return Optional.empty();
        }
        try {
            Jwt jwt = decoder().decode(token);
            String sessionId = jwt.getClaimAsString(SESSION_CLAIM);
            if (jwt.getSubject() == null || sessionId == null) {
                return Optional.empty();
            }
            return Optional.of(new AccessTokenIdentity(
                    UUID.fromString(jwt.getSubject()), UUID.fromString(sessionId)));
        } catch (JwtException | IllegalArgumentException e) {
            // Signature failure, expiry and malformed input all land here and are
            // all treated identically: no token, no identity, no explanation.
            return Optional.empty();
        }
    }

    private void requireConfigured() {
        String missing = properties.firstMissingProperty();
        if (missing != null) {
            throw new MissingConfigurationException(missing);
        }
    }

    private NimbusJwtEncoder encoder() {
        NimbusJwtEncoder local = encoder;
        if (local == null) {
            synchronized (this) {
                local = encoder;
                if (local == null) {
                    local = new NimbusJwtEncoder(new ImmutableSecret<>(secretKey()));
                    encoder = local;
                }
            }
        }
        return local;
    }

    private NimbusJwtDecoder decoder() {
        NimbusJwtDecoder local = decoder;
        if (local == null) {
            synchronized (this) {
                local = decoder;
                if (local == null) {
                    local = NimbusJwtDecoder.withSecretKey(secretKey())
                            .macAlgorithm(MacAlgorithm.HS256)
                            .build();
                    decoder = local;
                }
            }
        }
        return local;
    }

    private SecretKey secretKey() {
        requireConfigured();
        return new SecretKeySpec(
                properties.signingSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    /** What a verified access token asserts. Nothing more is trusted from it. */
    public record AccessTokenIdentity(UUID userId, UUID sessionId) {
    }
}
