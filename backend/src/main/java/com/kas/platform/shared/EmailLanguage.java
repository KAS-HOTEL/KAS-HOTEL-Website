package com.kas.platform.shared;

/** Recipient nationality, independent of the language used to browse the website. */
public final class EmailLanguage {
    private EmailLanguage() { }

    public static String forCountry(String country) {
        return country != null && "VN".equalsIgnoreCase(country.trim()) ? "vi" : "en";
    }
}
