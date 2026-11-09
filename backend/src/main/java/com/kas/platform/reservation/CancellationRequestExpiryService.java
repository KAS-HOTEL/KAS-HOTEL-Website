package com.kas.platform.reservation;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Persists cancellation expiry independently from customer/operator decisions. */
@Service
public class CancellationRequestExpiryService {

    private final JdbcClient jdbc;

    public CancellationRequestExpiryService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int expireDueRequests(OffsetDateTime at) {
        return jdbc.sql("""
                        UPDATE reservation_cancellation_request cr
                           SET status = 'EXPIRED',
                               expired_at = (r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                               updated_at = :at
                          FROM reservation r
                         WHERE r.id = cr.reservation_id
                           AND cr.status IN ('PENDING_HOTEL_FEE', 'QUOTED')
                           AND ((r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') <= :at
                        """)
                .param("at", at).update();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int expireDueRequests(UUID reservationId, OffsetDateTime at) {
        return jdbc.sql("""
                        UPDATE reservation_cancellation_request cr
                           SET status = 'EXPIRED',
                               expired_at = (r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                               updated_at = :at
                          FROM reservation r
                         WHERE r.id = cr.reservation_id
                           AND cr.reservation_id = :reservationId
                           AND cr.status IN ('PENDING_HOTEL_FEE', 'QUOTED')
                           AND ((r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') <= :at
                        """)
                .param("reservationId", reservationId).param("at", at).update();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int expireDueRequest(UUID requestId, OffsetDateTime at) {
        return jdbc.sql("""
                        UPDATE reservation_cancellation_request cr
                           SET status = 'EXPIRED',
                               expired_at = (r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                               updated_at = :at
                          FROM reservation r
                         WHERE r.id = cr.reservation_id
                           AND cr.id = :requestId
                           AND cr.status IN ('PENDING_HOTEL_FEE', 'QUOTED')
                           AND ((r.check_in + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh') <= :at
                        """)
                .param("requestId", requestId).param("at", at).update();
    }
}
