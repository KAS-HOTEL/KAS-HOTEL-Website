package com.kas.platform.media.api;

import com.kas.platform.identity.Permissions;
import com.kas.platform.identity.UserRole;
import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.security.CurrentActor;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.ConflictException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.media.SiteImageSlot;
import com.kas.platform.media.SiteImageSlotRepository;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;

/**
 * Admin CMS surface for the complete legacy image-slot catalogue.
 *
 * <p>The permission decides: ADMIN owns website content whatever its scope. V1 has
 * one partner, so a PARTNER-scoped ADMIN editing the shared site reaches nobody
 * else's data. With a second partner this needs revisiting, because these slots
 * belong to no partner.
 */
@RestController
@RequestMapping("/api/v1/admin/site-image-slots")
@PreAuthorize("hasAuthority('" + Permissions.CONTENT_MANAGE + "')")
public class AdminSiteImageSlotController {
    private final SiteImageSlotRepository slots;
    private final AuditLogger audit;

    public AdminSiteImageSlotController(SiteImageSlotRepository slots, AuditLogger audit) {
        this.slots = slots;
        this.audit = audit;
    }

    @GetMapping
    public List<SiteImageSlot> list() {
        return slots.findAll();
    }

    @PatchMapping("/{key}")
    @Transactional
    public SiteImageSlot update(@PathVariable String key, @Valid @RequestBody SiteImageSlotRequest request) {
        String reference = request.imageReference();
        if (reference != null && !reference.isBlank()) {
            validateReference(reference.trim());
            reference = reference.trim();
        } else {
            reference = null;
        }
        SiteImageSlot before = slots.findByKey(key)
                .orElseThrow(() -> NotFoundException.outOfScope("Site image slot"));
        var actor = CurrentActor.require().actor();
        SiteImageSlot updated = slots.updateIfCurrent(key, before.currentReference(), before.enabled(),
                        reference, request.enabled(), actor.userId())
                .orElseThrow(() -> ConflictException.versionConflict("Site image slot"));
        String actorRole = actor.roles().contains(UserRole.SUPER_ADMIN)
                ? UserRole.SUPER_ADMIN.name()
                : actor.roles().stream().map(Enum::name).sorted().findFirst()
                        .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                                "An assigned role is required for audited changes."));
        audit.record(new AuditEvent(actor.userId(), actorRole, "site_image_slot.updated", "site_image_slot", null,
                java.util.Map.of("slotKey", key, "imageReference", before.imageReference() == null ? "" : before.imageReference(),
                        "enabled", before.enabled()),
                java.util.Map.of("slotKey", key, "imageReference", updated.imageReference() == null ? "" : updated.imageReference(),
                        "enabled", updated.enabled()), null, null, null, null, actor.scope().toString()));
        return updated;
    }

    private static void validateReference(String reference) {
        if (reference.startsWith("/")) {
            if (reference.startsWith("//") || reference.contains("\\") || reference.contains("..")) {
                throw invalidReference();
            }
            return;
        }
        try {
            URI uri = URI.create(reference);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null) throw invalidReference();
        } catch (IllegalArgumentException exception) {
            throw invalidReference();
        }
    }

    private static KasException invalidReference() {
        return new KasException(ApiErrorCode.VALIDATION_FAILED,
                "Image reference must be an HTTPS URL or a same-origin path.");
    }
}
