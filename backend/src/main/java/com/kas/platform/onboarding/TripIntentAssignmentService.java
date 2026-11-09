package com.kas.platform.onboarding;

import com.kas.platform.audit.AuditEvent;
import com.kas.platform.audit.AuditLogger;
import com.kas.platform.identity.ResolvedActor;
import com.kas.platform.identity.UserRole;
import com.kas.platform.property.PropertyRepository;
import com.kas.platform.property.TripIntentRepository;
import com.kas.platform.shared.ApiErrorCode;
import com.kas.platform.shared.CorrelationId;
import com.kas.platform.shared.KasException;
import com.kas.platform.shared.NotFoundException;
import com.kas.platform.shared.scope.AuthorizationScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Validates, scopes, audits, and replaces the editorial groups on one hotel. */
@Service
public class TripIntentAssignmentService {

    private final PropertyRepository properties;
    private final TripIntentRepository intents;
    private final AuditLogger audit;

    public TripIntentAssignmentService(PropertyRepository properties,
                                       TripIntentRepository intents,
                                       AuditLogger audit) {
        this.properties = properties;
        this.intents = intents;
        this.audit = audit;
    }

    @Transactional
    public List<String> replace(UUID propertyId, List<String> requested,
                                ResolvedActor actor, AuthorizationScope scope) {
        List<String> codes = requested == null ? List.of() : requested.stream().distinct().toList();
        List<String> before = properties.findById(propertyId, scope)
                .map(ignored -> intents.findCodes(propertyId, scope))
                .orElseThrow(() -> NotFoundException.outOfScope("Property"));

        Set<String> known = intents.knownCodes(codes);
        List<KasException.ErrorDetail> unknown = codes.stream()
                .filter(code -> !known.contains(code))
                .map(code -> new KasException.ErrorDetail("intentCodes", "UNKNOWN_TRIP_INTENT",
                        "'" + code + "' is not a supported trip intent."))
                .toList();
        if (!unknown.isEmpty()) {
            throw new KasException(ApiErrorCode.VALIDATION_FAILED,
                    "One or more trip intents are not in the catalog.", unknown);
        }

        intents.replace(propertyId, codes, scope);
        audit.record(new AuditEvent(
                actor.userId(), highestRole(actor), "property.trip_intents_changed", "property",
                propertyId, Map.of("intentCodes", before), Map.of("intentCodes", codes),
                null, null, null, CorrelationId.current(), scope.toString()));
        return codes;
    }

    private static String highestRole(ResolvedActor actor) {
        if (actor.roles().contains(UserRole.SUPER_ADMIN)) return UserRole.SUPER_ADMIN.name();
        if (actor.roles().contains(UserRole.ADMIN)) return UserRole.ADMIN.name();
        return UserRole.CUSTOMER.name();
    }
}
