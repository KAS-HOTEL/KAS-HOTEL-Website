package com.kas.platform.security;

import com.kas.platform.identity.AppUser;
import com.kas.platform.identity.IdentityRepository;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.ScopeResolver;
import com.kas.platform.identity.UserSessionRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Optional;

/**
 * Turns an access-token cookie into an authenticated {@link KasPrincipal}.
 *
 * <p><strong>Deliberately not a {@code @Component}.</strong> Spring Boot
 * auto-registers every {@code Filter} bean in the servlet container's chain,
 * which would run this <em>before</em> Spring Security's
 * {@code SecurityContextHolderFilter} — and that filter then replaces the
 * context this one just populated. Worse, {@code OncePerRequestFilter} would
 * skip the second, correctly-ordered invocation inside the security chain, so
 * every request would arrive anonymous. It is constructed by
 * {@code SecurityConfig} and inserted at one explicit position instead.
 *
 * <p>Four checks, in order, and every one of them must pass:
 *
 * <ol>
 *   <li>the token's signature and expiry are valid;</li>
 *   <li><strong>the session it names is still active</strong> — this is what
 *       makes doc 59 §8's "logout genuinely invalidates" true rather than
 *       aspirational, since a signed token alone would remain valid until it
 *       expired;</li>
 *   <li>the user still exists and is still active — a suspended account loses
 *       access on its next request, not at its next login;</li>
 *   <li>permissions and scope are resolved <strong>from the database</strong>,
 *       so a revoked role assignment takes effect immediately.</li>
 * </ol>
 *
 * <p>The filter never rejects a request itself. It either establishes an
 * identity or leaves the context empty and lets the authorization rules decide —
 * so an anonymous request to a public endpoint still works, and an anonymous
 * request to a protected one is refused by the chain, in one place.
 */
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private final AuthCookies cookies;
    private final AccessTokenService accessTokens;
    private final UserSessionRepository sessions;
    private final IdentityRepository identity;
    private final ScopeResolver scopeResolver;

    private final org.springframework.security.authentication.AuthenticationTrustResolver trustResolver =
            new org.springframework.security.authentication.AuthenticationTrustResolverImpl();

    public TokenAuthenticationFilter(AuthCookies cookies,
                                     AccessTokenService accessTokens,
                                     UserSessionRepository sessions,
                                     IdentityRepository identity,
                                     ScopeResolver scopeResolver) {
        this.cookies = cookies;
        this.accessTokens = accessTokens;
        this.sessions = sessions;
        this.identity = identity;
        this.scopeResolver = scopeResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (isUnauthenticated(SecurityContextHolder.getContext().getAuthentication())) {
            authenticate(request).ifPresent(principal -> {
                var authentication = new UsernamePasswordAuthenticationToken(
                        principal, null, principal.authorities());
                // A NEW context, installed with setContext. Mutating the context
                // returned by getContext() writes into the deferred supplier that
                // SecurityContextHolderFilter installed, and the change does not
                // survive to AuthorizationFilter — every request then arrives
                // anonymous while login itself appears to work.
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(authentication);
                SecurityContextHolder.setContext(context);
            });
        }
        // The context is NOT cleared here. SecurityContextHolderFilter already
        // clears it at the end of every request, and clearing it in this filter
        // breaks the 401/403 distinction: ExceptionTranslationFilter sits further
        // out, and decides between "you are nobody, authenticate" and "you are
        // someone, but no" by reading the context after the exception propagates.
        // Emptied early, an anonymous refusal reports 403 instead of 401.
        chain.doFilter(request, response);
    }

    /**
     * Treats an anonymous token as "not authenticated".
     *
     * <p>A plain {@code == null} check is not enough and fails silently:
     * {@code AnonymousAuthenticationFilter} populates the context with an
     * {@code AnonymousAuthenticationToken} for every unauthenticated request, so
     * a null check would skip this filter entirely and every caller would arrive
     * anonymous while login itself looked perfectly healthy.
     */
    private boolean isUnauthenticated(org.springframework.security.core.Authentication existing) {
        return existing == null || trustResolver.isAnonymous(existing);
    }

    private Optional<KasPrincipal> authenticate(HttpServletRequest request) {
        Instant now = Instant.now();

        return cookies.readAccess(request)
                .flatMap(accessTokens::verify)
                .flatMap(token -> sessions.findActiveById(token.sessionId(), now)
                        // The token's subject must match the session's owner. A
                        // token signed for one user cannot borrow another's session.
                        .filter(session -> session.userId().equals(token.userId())))
                .flatMap(session -> identity.findById(session.userId())
                        .filter(user -> user.isActive(now))
                        .map(user -> resolvePrincipal(user, session.id())));
    }

    private KasPrincipal resolvePrincipal(AppUser user, java.util.UUID sessionId) {
        ResolvedActor actor = scopeResolver.resolve(user, identity.findActiveAssignments(user.id()));
        if (actor.roles().contains(com.kas.platform.identity.UserRole.CUSTOMER) && user.emailVerifiedAt() == null) return null;
        return new KasPrincipal(actor, sessionId);
    }
}
