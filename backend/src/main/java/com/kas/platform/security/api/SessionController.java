package com.kas.platform.security.api;

import com.kas.platform.identity.UserSession;
import com.kas.platform.identity.UserSessionRepository;
import com.kas.platform.security.AuthenticationService;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.security.KasPrincipal;
import com.kas.platform.shared.NotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Session management for the signed-in user — doc 58 §4.
 *
 * <h2>Why {@code isAuthenticated()} and not a permission</h2>
 *
 * <p>Doc 59 §4.8 lists the OWN-scope permissions and <strong>defines none for
 * session management</strong>. Doc 58 §4 states the control that applies instead:
 * "Ownership is checked on every record. A reference identifies; the session
 * authorises." Requiring a permission here would mean inventing one, which the
 * phase brief forbids.
 *
 * <p>So authorisation is ownership, and ownership is enforced in SQL — see
 * {@link UserSessionRepository#findOwned} and {@code revokeOwned}. A session id
 * belonging to another user is never fetched, so it cannot be read or revoked,
 * and the caller receives 404 rather than 403: doc 59 §7.8 returns 404 where
 * revealing existence would itself leak information.
 */
@RestController
@RequestMapping("/api/v1/me/sessions")
public class SessionController {

    private final UserSessionRepository sessions;
    private final AuthenticationService authentication;

    public SessionController(UserSessionRepository sessions, AuthenticationService authentication) {
        this.sessions = sessions;
        this.authentication = authentication;
    }

    /** The caller's own active sessions, with the current one marked. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<SessionView> list() {
        KasPrincipal principal = CurrentActor.require();
        return sessions.listActive(principal.userId(), Instant.now()).stream()
                .map(session -> SessionView.of(session, isCurrent(session, principal)))
                .toList();
    }

    /**
     * Revokes one of the caller's own sessions.
     *
     * <p>404 when the session does not exist <em>or</em> belongs to someone else.
     * The two are indistinguishable by construction: the ownership predicate is
     * in the UPDATE statement, so no row is ever examined and then rejected.
     */
    @DeleteMapping("/{sessionId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> revoke(@PathVariable UUID sessionId) {
        KasPrincipal principal = CurrentActor.require();
        if (!sessions.revokeOwned(sessionId, principal.userId(), Instant.now())) {
            throw NotFoundException.outOfScope("Session");
        }
        return ResponseEntity.noContent().build();
    }

    /** "Sign out everywhere" — doc 58 §4. Includes the current session. */
    @DeleteMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> revokeAll() {
        authentication.logoutEverywhere(CurrentActor.require().userId());
        return ResponseEntity.noContent().build();
    }

    private static boolean isCurrent(UserSession session, KasPrincipal principal) {
        return principal.sessionId() != null && principal.sessionId().equals(session.id());
    }
}
