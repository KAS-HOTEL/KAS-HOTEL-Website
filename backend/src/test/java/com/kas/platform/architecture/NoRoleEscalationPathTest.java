package com.kas.platform.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 2 permission audit (2026-11-07): no API path can grant or change a staff role.
 *
 * <p>Roles live in {@code role_assignment}. The application writes it in exactly one
 * place — customer self-registration, which can only create a {@code CUSTOMER} role.
 * Staff accounts and their ADMIN / SUPER_ADMIN roles are provisioned out of band by the
 * owner's provisioning tool (doc 154), never through an endpoint, so an ADMIN cannot
 * promote itself to SUPER_ADMIN. If a new write appears, this test names the file so the
 * change gets a deliberate security review (and its own test) instead of slipping in.
 */
class NoRoleEscalationPathTest {

    private static final Pattern ROLE_WRITE = Pattern.compile(
            "(?i)(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(kas\\.)?role_assignment\\b");

    private static final List<String> ALLOWED = List.of(
            "security/CustomerRegistrationService.java");

    @Test
    @DisplayName("only customer registration writes role_assignment in application code")
    void roleAssignmentHasOneWriter() throws IOException {
        Path main = Path.of("src/main/java/com/kas/platform");
        List<String> writers;
        try (Stream<Path> files = Files.walk(main)) {
            writers = files.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> {
                        try {
                            return ROLE_WRITE.matcher(Files.readString(p)).find();
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .map(p -> main.relativize(p).toString().replace('\\', '/'))
                    .sorted()
                    .toList();
        }
        assertThat(writers).containsExactlyElementsOf(ALLOWED);
    }

    @Test
    @DisplayName("customer registration can only create the CUSTOMER role")
    void registrationGrantsOnlyCustomer() throws IOException {
        String source = Files.readString(Path.of(
                "src/main/java/com/kas/platform/security/CustomerRegistrationService.java"));
        int at = source.indexOf("INSERT INTO role_assignment");
        assertThat(at).isPositive();
        String statement = source.substring(at, Math.min(source.length(), at + 400));
        assertThat(statement).contains("CUSTOMER").doesNotContain("ADMIN");
    }
}
