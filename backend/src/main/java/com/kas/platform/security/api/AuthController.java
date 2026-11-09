package com.kas.platform.security.api;

import com.kas.platform.security.AuthCookies;
import com.kas.platform.security.AuthenticationService;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.security.CustomerRegistrationService;
import com.kas.platform.security.CustomerPasswordResetService;
import com.kas.platform.security.CustomerEmailNotifications;
import com.kas.platform.security.CustomerEmailVerificationService;
import com.kas.platform.security.PublicEndpoint;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Authentication endpoints — doc 58 §3.4.
 *
 * <p>{@code /login}, {@code /refresh}, {@code /logout}, customer registration
 * customer email verification and one-use password reset are implemented.
 *
 * <p>Doc 154: staff use one shared SUPER_ADMIN account created by KAS, so
 * partner self-registration ({@code /register}) is withdrawn.
 *
 * <h2>The session endpoints answer 204 with no body</h2>
 *
 * <p>Deliberate. Tokens travel as {@code HttpOnly} cookies (doc 59 §8), so there
 * is nothing for a body to carry that would not be either useless or dangerous:
 * doc 58 §9 denylists {@code permissions[]} and {@code roleAssignments} from
 * customer-facing responses, and returning the role or the user id here would
 * add a disclosure surface for no gain. A body that does not exist cannot leak.
 */
@RestController
@RequestMapping("/api/v1/public/auth")
public class AuthController {

    private final AuthenticationService authentication;
    private final CustomerRegistrationService customerRegistration;
    private final AuthCookies cookies;
    private final CustomerPasswordResetService passwordResets;
    private final CustomerEmailNotifications emailNotifications;
    private final CustomerEmailVerificationService verifications;

    public AuthController(AuthenticationService authentication,
                          CustomerRegistrationService customerRegistration,
                          AuthCookies cookies,
                          CustomerPasswordResetService passwordResets, CustomerEmailNotifications emailNotifications,
                          CustomerEmailVerificationService verifications) {
        this.authentication = authentication;
        this.customerRegistration = customerRegistration;
        this.cookies = cookies;
        this.passwordResets = passwordResets;
        this.emailNotifications = emailNotifications;
        this.verifications = verifications;
    }

    @PostMapping("/forgot-password")
    @PublicEndpoint(reason = "Requests a one-use customer password reset email")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<ResetRequestView> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResets.request(request.email());
        return ResponseEntity.accepted().body(new ResetRequestView(
                "If an active KAS member account matches this email, a reset link will be sent."));
    }

    @PostMapping("/reset-password")
    @PublicEndpoint(reason = "Consumes a one-use customer password reset token")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResets.reset(request.token(), request.newPassword());
        return ResponseEntity.noContent().build();
    }

    /** Creates a KAS customer identity and queues its one-time verification code. */
    @PostMapping("/customer-register")
    @PublicEndpoint(reason = "Creates a customer account; email verification is required before sign-in")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Void> registerCustomer(@Valid @RequestBody CustomerRegistrationRequest request,
                                                  HttpServletRequest httpRequest) {
        var userId = customerRegistration.register(new CustomerRegistrationService.Registration(
                request.fullName(), request.email(), request.phone(), request.password(), request.locale(), request.country()));
        verifications.request(request.email());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PostMapping("/resend-verification")
    @PublicEndpoint(reason = "Requests an email ownership code with a generic response and account cooldown")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<ResetRequestView> resendVerification(@Valid @RequestBody ForgotPasswordRequest request) {
        verifications.request(request.email());
        return ResponseEntity.accepted().body(new ResetRequestView("If an unverified account matches, a verification email will be sent."));
    }

    @PostMapping("/verify-email")
    @PublicEndpoint(reason = "Consumes an expiring, single-use email ownership code")
    @org.springframework.transaction.annotation.Transactional(noRollbackFor = com.kas.platform.shared.KasException.class)
    public ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailNotifications.welcome(verifications.verify(request.email(), request.code()));
        return ResponseEntity.noContent().build();
    }

    public record VerifyEmailRequest(@NotBlank @Email @Size(max = 320) String email,
                                     @NotBlank @Size(min = 6, max = 6) String code) { }

    /**
     * Doc 58 §3.4. Sets the access and refresh cookies.
     *
     * <p>Public because authentication is what it establishes. Every failure —
     * unknown account, wrong password, suspended, locked — returns an identical
     * 401, so the endpoint cannot be used to discover which email addresses have
     * accounts.
     */
    @PostMapping("/login")
    @PublicEndpoint(reason = "Doc 58 §3.4 — establishes authentication; there is no prior identity")
    public ResponseEntity<Void> login(@Valid @RequestBody LoginRequest request,
                                      HttpServletRequest httpRequest) {
        var session = authentication.login(request.email(), request.password(),
                deviceContext(httpRequest), surface(httpRequest));

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE,
                        cookies.access(session.accessToken(), session.accessTokenTtl()).toString())
                .header(HttpHeaders.SET_COOKIE,
                        cookies.refresh(session.refreshToken(), session.refreshTokenTtl()).toString())
                .build();
    }

    /**
     * Doc 58 §3.4. Rotates the refresh token and issues a new access token.
     *
     * <p>Public in the same sense as login: the refresh cookie <em>is</em> the
     * credential, so there is no prior access token to require.
     */
    @PostMapping("/refresh")
    @PublicEndpoint(reason = "Doc 58 §3.4 — the refresh cookie is the credential being presented")
    public ResponseEntity<Void> refresh(HttpServletRequest httpRequest) {
        var session = authentication.refresh(
                cookies.readRefresh(httpRequest).orElse(null), deviceContext(httpRequest),
                surface(httpRequest));

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE,
                        cookies.access(session.accessToken(), session.accessTokenTtl()).toString())
                .header(HttpHeaders.SET_COOKIE,
                        cookies.refresh(session.refreshToken(), session.refreshTokenTtl()).toString())
                .build();
    }

    /**
     * Doc 58 §3.4. Revokes the current session server-side and clears the cookies.
     *
     * <p>Requires authentication: there is a session to end, and it is identified
     * from the verified access token rather than from anything the caller sends,
     * so one user cannot log another out.
     */
    @PostMapping("/logout")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> logout() {
        var principal = CurrentActor.require();
        if (principal.sessionId() != null) {
            authentication.logout(principal.sessionId());
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.clearedAccess().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.clearedRefresh().toString())
                .build();
    }

    /** The host the website / console proxy declared (server separation, doc 156). */
    private static com.kas.platform.security.ClientSurface surface(HttpServletRequest request) {
        return com.kas.platform.security.ClientSurface.fromHeader(
                request.getHeader(com.kas.platform.security.ClientSurface.HEADER));
    }

    private AuthenticationService.DeviceContext deviceContext(HttpServletRequest request) {
        // The device label is the user agent for now; doc 58 defines no client
        // supplied device name, and accepting one would let a caller write
        // arbitrary text into another surface.
        String userAgent = request.getHeader(HttpHeaders.USER_AGENT);
        return new AuthenticationService.DeviceContext(userAgent, request.getRemoteAddr(), userAgent);
    }

    public record ForgotPasswordRequest(@NotBlank @Email @Size(max = 320) String email) {}
    public record ResetPasswordRequest(@NotBlank @Size(max = 100) String token,
                                       @NotBlank @Size(min = 8, max = 200) String newPassword) {}
    public record ResetRequestView(String message) {}
}
