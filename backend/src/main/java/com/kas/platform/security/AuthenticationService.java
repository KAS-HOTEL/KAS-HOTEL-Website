package com.kas.platform.security;

import com.kas.platform.identity.AppUser;
import com.kas.platform.identity.IdentityRepository;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.ScopeResolver;
import com.kas.platform.identity.StoredCredential;
import com.kas.platform.identity.UserRole;
import com.kas.platform.identity.UserSessionRepository;
import com.kas.platform.shared.CorrelationId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Login, refresh and logout.
 *
 * <p>Implements doc 59 §8 and doc 06 §5.2–5.3. Three properties are worth
 * stating because they are easy to lose in a later edit:
 *
 * <ol>
 *   <li><strong>Every failure path raises the same exception.</strong> See
 *       {@link InvalidCredentialsException}.</li>
 *   <li><strong>A missing account still costs a password verification.</strong>
 *       Without that, "unknown email" returns in microseconds while "wrong
 *       password" takes an Argon2id verification, and the difference is a
 *       reliable account-existence oracle.</li>
 *   <li><strong>Nothing here logs a password, a token or a digest.</strong> Log
 *       lines carry the user id and the correlation id only.</li>
 * </ol>
 */
@Service
public class AuthenticationService {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationService.class);

    private final IdentityRepository identity;
    private final UserSessionRepository sessions;
    private final ScopeResolver scopeResolver;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenService accessTokens;
    private final RefreshTokenService refreshTokens;
    private final AuthenticationProperties properties;

    /**
     * A real Argon2id hash of a value nobody holds, verified against whenever no
     * stored credential is available. Computed once, lazily.
     */
    private volatile String timingEqualisationHash;

    public AuthenticationService(IdentityRepository identity,
                                 UserSessionRepository sessions,
                                 ScopeResolver scopeResolver,
                                 PasswordEncoder passwordEncoder,
                                 AccessTokenService accessTokens,
                                 RefreshTokenService refreshTokens,
                                 AuthenticationProperties properties) {
        this.identity = identity;
        this.sessions = sessions;
        this.scopeResolver = scopeResolver;
        this.passwordEncoder = passwordEncoder;
        this.accessTokens = accessTokens;
        this.refreshTokens = refreshTokens;
        this.properties = properties;
    }

    /**
     * Authenticates and opens a session.
     *
     * @throws InvalidCredentialsException for every failure, uniformly
     * @throws com.kas.platform.shared.MissingConfigurationException when session
     *         configuration is absent — the operation stops rather than guessing
     *         a lifetime
     */
    // A refusal must still commit what it recorded — the failure count and any
    // lock (doc 154). Rolling back on InvalidCredentialsException would discard
    // them, and the lockout would never trigger.
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public AuthenticatedSession login(String email, String password, DeviceContext device) {
        return login(email, password, device, ClientSurface.UNSPECIFIED);
    }

    /**
     * As {@link #login(String, String, DeviceContext)}, refusing an account that belongs
     * on the other host (server separation): staff sign in on the console, customers on
     * the website. The check runs after the password, so it discloses nothing to someone
     * who does not already hold the credentials, and no session is opened.
     */
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public AuthenticatedSession login(String email, String password, DeviceContext device,
                                      ClientSurface surface) {
        Instant now = Instant.now();

        Optional<AppUser> found = email == null ? Optional.empty() : identity.findByEmail(email);
        if (found.isEmpty()) {
            equaliseTiming(password);
            throw refuse("no account for the submitted email");
        }

        AppUser user = found.get();

        // A locked account is refused before its password is checked, so an
        // attempt during the lock neither succeeds nor extends it. The timing
        // still costs one verification, and the response is the same 401.
        if (user.lockedUntil() != null && !user.lockedUntil().isBefore(now)) {
            equaliseTiming(password);
            throw refuse("user " + user.id() + " is locked");
        }

        Optional<StoredCredential> credential = identity.findCredential(user.id());
        if (credential.isEmpty()) {
            equaliseTiming(password);
            throw refuse("user " + user.id() + " has no password credential");
        }

        if (!passwordEncoder.matches(password, credential.get().passwordHash())) {
            recordFailure(user, now);
            throw refuse("password mismatch for user " + user.id());
        }

        // Checked AFTER the password, so a wrong password and a suspended account
        // are indistinguishable in both response and timing.
        if (!user.isActive(now)) {
            throw refuse("user " + user.id() + " is " + user.status()
                    + (user.lockedUntil() != null ? " or locked" : ""));
        }

        ResolvedActor actor = resolveActor(user);
        requireSurface(actor, surface);
        requireVerifiedCustomer(user, actor);

        identity.recordSuccessfulLogin(user.id(), now);

        Duration refreshTtl = refreshTtlFor(actor.roles());
        String refreshToken = refreshTokens.generate();
        UUID sessionId = sessions.create(user.id(), refreshTokens.hash(refreshToken),
                now.plus(refreshTtl), device.device(), device.ip(), device.userAgent());

        log.info("login succeeded user={} sessionId={} roles={} correlationId={}",
                user.id(), sessionId, actor.roles(), CorrelationId.current());

        return new AuthenticatedSession(
                accessTokens.issue(user.id(), sessionId, now),
                refreshToken,
                properties.accessTokenTtl(),
                refreshTtl,
                actor,
                sessionId);
    }

    /**
     * Rotates the refresh token and issues a new access token.
     *
     * <p>Rotation happens on the same session row, so the device entry in
     * {@code GET /me/sessions} survives. The previous digest is part of the
     * update predicate, so a replayed token cannot rotate a second time.
     */
    // A refusal must still commit what it did: refusing an inactive account
    // revokes all its sessions (doc 59 §8 offboarding), and rolling back on
    // InvalidCredentialsException would silently restore them.
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public AuthenticatedSession refresh(String presentedRefreshToken, DeviceContext device) {
        return refresh(presentedRefreshToken, device, ClientSurface.UNSPECIFIED);
    }

    /**
     * As {@link #refresh(String, DeviceContext)}; a session presented on the wrong host
     * (a staff session on the website, a customer session on the console) is not
     * extended there. The session itself is left alone, so it still works on its own host.
     */
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public AuthenticatedSession refresh(String presentedRefreshToken, DeviceContext device,
                                        ClientSurface surface) {
        Instant now = Instant.now();

        if (presentedRefreshToken == null || presentedRefreshToken.isBlank()) {
            throw refuse("no refresh token presented");
        }

        String presentedHash = refreshTokens.hash(presentedRefreshToken);
        var session = sessions.findActiveByRefreshHash(presentedHash, now)
                .orElseThrow(() -> refuse("refresh token is unknown, expired or revoked"));

        AppUser user = identity.findById(session.userId())
                .orElseThrow(() -> refuse("session " + session.id() + " has no user"));

        if (!user.isActive(now)) {
            // Doc 59 §8 offboarding: a disabled account cannot extend a session
            // it already holds.
            sessions.revokeAllForUser(user.id(), now);
            throw refuse("user " + user.id() + " is no longer active; sessions revoked");
        }

        ResolvedActor actor = resolveActor(user);
        if (!belongsOn(actor, surface)) {
            throw refuse("session " + session.id() + " presented on the " + surface + " host");
        }
        requireVerifiedCustomer(user, actor);
        String rotated = refreshTokens.generate();
        if (!sessions.rotateRefreshToken(session.id(), presentedHash,
                refreshTokens.hash(rotated), now)) {
            throw refuse("refresh token was already rotated (possible replay)");
        }


        return new AuthenticatedSession(
                accessTokens.issue(user.id(), session.id(), now),
                rotated,
                properties.accessTokenTtl(),
                refreshTtlFor(actor.roles()),
                actor,
                session.id());
    }

    /** Doc 59 §8: "logout genuinely invalidates". */
    @Transactional
    public void logout(UUID sessionId) {
        sessions.revoke(sessionId, Instant.now());
        log.info("logout sessionId={} correlationId={}", sessionId, CorrelationId.current());
    }

    /** "Sign out everywhere" — doc 58 §4. */
    @Transactional
    public int logoutEverywhere(UUID userId) {
        int revoked = sessions.revokeAllForUser(userId, Instant.now());
        log.info("sign-out-everywhere user={} revoked={} correlationId={}",
                userId, revoked, CorrelationId.current());
        return revoked;
    }

    /** Resolves permissions and scope from the database, never from a token. */
    public ResolvedActor resolveActor(AppUser user) {
        return scopeResolver.resolve(user, identity.findActiveAssignments(user.id()));
    }

    /** Doc 06 §5.3 and doc 59 §8: a staff refresh lives shorter than a customer's. */
    private Duration refreshTtlFor(Set<UserRole> roles) {
        boolean staff = roles.contains(UserRole.ADMIN) || roles.contains(UserRole.SUPER_ADMIN);
        return staff ? properties.staffRefreshTtl() : properties.customerRefreshTtl();
    }

    /**
     * Doc 154: {@code lockout-max-failures} consecutive wrong passwords lock the
     * account for {@code lockout-duration}. Without both values configured the
     * failure is only counted — a threshold is never invented.
     */
    private void recordFailure(AppUser user, Instant now) {
        if (!properties.lockoutEnabled()) {
            identity.recordFailedLogin(user.id(), now);
            return;
        }
        if (identity.recordFailedLoginWithLockout(user.id(), now,
                properties.lockoutMaxFailures(), properties.lockoutDuration())) {
            log.warn("account locked after {} consecutive failed logins user={} for={} correlationId={}",
                    properties.lockoutMaxFailures(), user.id(), properties.lockoutDuration(),
                    CorrelationId.current());
        }
    }

    private InvalidCredentialsException refuse(String serverSideReason) {
        log.debug("authentication refused: {} correlationId={}",
                serverSideReason, CorrelationId.current());
        return new InvalidCredentialsException(serverSideReason);
    }

    /**
     * Spends the same work as a real verification when there is nothing to verify
     * against, so response time does not disclose whether an account exists.
     */
    private void equaliseTiming(String submittedPassword) {
        String hash = timingEqualisationHash;
        if (hash == null) {
            synchronized (this) {
                hash = timingEqualisationHash;
                if (hash == null) {
                    hash = passwordEncoder.encode(UUID.randomUUID().toString());
                    timingEqualisationHash = hash;
                }
            }
        }
        passwordEncoder.matches(submittedPassword == null ? "" : submittedPassword, hash);
    }

    /** Where the request came from, for the session list in doc 58 §4. */
    public record DeviceContext(String device, String ip, String userAgent) {
    }

    /**
     * The result of authenticating.
     *
     * <p>Carries the raw tokens because the caller must set them as cookies.
     * They are never logged and never serialised into a response body — doc 59
     * §8: "Tokens transported in HttpOnly, Secure, SameSite cookies — never
     * localStorage".
     */
    public record AuthenticatedSession(
            String accessToken,
            String refreshToken,
            Duration accessTokenTtl,
            Duration refreshTokenTtl,
            ResolvedActor actor,
            UUID sessionId) {

        @Override
        public String toString() {
            return "AuthenticatedSession[session=" + sessionId
                    + ", user=" + actor.userId() + ", tokens=<redacted>]";
        }
    }
    /** Staff = ADMIN or SUPER_ADMIN (the same split as {@link #refreshTtlFor}). */
    private static boolean isStaff(ResolvedActor actor) {
        return actor.roles().contains(UserRole.ADMIN) || actor.roles().contains(UserRole.SUPER_ADMIN);
    }

    /** Whether this account may hold a session on the host the request came through. */
    static boolean belongsOn(ResolvedActor actor, ClientSurface surface) {
        return switch (surface) {
            case CUSTOMER_SITE -> !isStaff(actor);
            case CONSOLE -> isStaff(actor);
            case UNSPECIFIED -> true;
        };
    }

    /**
     * Server separation: a staff account is refused on the website and a customer
     * account on the console, with a code the page can turn into "sign in on the other
     * host". Reached only after a correct password, so it reveals nothing new.
     */
    private static void requireSurface(ResolvedActor actor, ClientSurface surface) {
        if (belongsOn(actor, surface)) return;
        boolean staff = isStaff(actor);
        String code = staff ? "USE_ADMIN_CONSOLE" : "USE_CUSTOMER_SITE";
        String message = staff
                ? "Staff accounts sign in on the KAS admin console."
                : "Guest accounts sign in on the KAS website.";
        log.info("login refused on the wrong host user={} surface={} correlationId={}",
                actor.userId(), surface, CorrelationId.current());
        throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.FORBIDDEN,
                message, java.util.List.of(
                new com.kas.platform.shared.KasException.ErrorDetail("account", code, message)));
    }

    private static void requireVerifiedCustomer(AppUser user, ResolvedActor actor) {
        if (actor.roles().contains(UserRole.CUSTOMER) && user.emailVerifiedAt() == null) {
            throw new com.kas.platform.shared.KasException(com.kas.platform.shared.ApiErrorCode.FORBIDDEN,
                    "Verify your email before signing in.", java.util.List.of(
                    new com.kas.platform.shared.KasException.ErrorDetail("email", "EMAIL_NOT_VERIFIED", "Verify your email before signing in.")));
        }
    }

}
