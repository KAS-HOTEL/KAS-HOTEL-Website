package com.kas.platform.security.api;

import com.kas.platform.identity.UserRole;
import com.kas.platform.security.CurrentActor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

/**
 * Which console the caller should see.
 *
 * <p>This chooses a navigation and nothing else. Every action is still authorised
 * by its own endpoint, and the one word returned here is neither a permission
 * list nor a role assignment, both of which doc 58 §9 keeps out of responses.
 */
@RestController
@RequestMapping("/api/v1/me/console")
public class MeConsoleController {

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ConsoleView console() {
        Set<UserRole> roles = CurrentActor.require().actor().roles();
        if (roles.contains(UserRole.SUPER_ADMIN)) return new ConsoleView("SUPER_ADMIN");
        return new ConsoleView(roles.contains(UserRole.ADMIN) ? "ADMIN" : "NONE");
    }

    public record ConsoleView(String console) { }
}
