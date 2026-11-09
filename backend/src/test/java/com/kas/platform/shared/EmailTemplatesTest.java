package com.kas.platform.shared;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class EmailTemplatesTest {
    private static final Pattern VARIABLE = Pattern.compile("\\{\\{\\{\\s*(\\w+)\\s*}}}");

    @Test void everyLocalDesignUsesOnlyDeclaredVariables() throws Exception {
        for (String key : EmailTemplates.KEYS) {
            assertThat(EmailTemplates.VARIABLES.get(key)).as("%s declares at most 20 variables", key).hasSizeLessThanOrEqualTo(20);
            for (String language : new String[]{"VI", "EN"}) {
                String name = "email-templates/" + key + "_" + language;
                String html = new ClassPathResource(name + ".html").getContentAsString(StandardCharsets.UTF_8);
                String subject = new ClassPathResource(name + ".subject.txt").getContentAsString(StandardCharsets.UTF_8);
                assertThat(subject).as(name).isNotBlank();
                assertThat(html).as("%s still uses the Brevo syntax", name).doesNotContain("params.");
                Set<String> used = new TreeSet<>();
                Matcher variable = VARIABLE.matcher(html);
                while (variable.find()) used.add(variable.group(1));
                assertThat(EmailTemplates.VARIABLES.get(key)).as(name).containsAll(used);
            }
        }
    }
}
