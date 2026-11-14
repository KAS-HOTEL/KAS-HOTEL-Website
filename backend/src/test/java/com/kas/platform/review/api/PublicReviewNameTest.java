package com.kas.platform.review.api;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The public review shows a short name, never the full name (2026-11-14). */
class PublicReviewNameTest {
    @Test void vietnameseNamesPutTheFamilyNameFirst() {
        assertThat(PublicGuestReviewController.shortName("Đinh Thị Anh Thư", "VN")).isEqualTo("Thư Đ.");
    }

    @Test void otherNamesPutItLast() {
        assertThat(PublicGuestReviewController.shortName("Josh Parker", "US")).isEqualTo("Josh P.");
        assertThat(PublicGuestReviewController.shortName("  Akshay   Sharma ", null)).isEqualTo("Akshay S.");
    }

    @Test void oneWordOrNoName() {
        assertThat(PublicGuestReviewController.shortName("Madonna", "US")).isEqualTo("Madonna");
        assertThat(PublicGuestReviewController.shortName(" ", "VN")).isNull();
        assertThat(PublicGuestReviewController.shortName(null, "VN")).isNull();
    }
}
