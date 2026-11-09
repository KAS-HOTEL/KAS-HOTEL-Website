package com.kas.platform.customer;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Expires unspent KAS points once daily, using the expiry snapshot on each earn lot. */
@Component
// On by default; set false on extra instances or a QA backend that shares the database.
@ConditionalOnProperty(name = "kas.cashback.expiry-sweep.enabled", havingValue = "true", matchIfMissing = true)
public class CashbackExpiryScheduler {
    private final JdbcClient jdbc;

    public CashbackExpiryScheduler(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 20 0 * * *", zone = "Asia/Ho_Chi_Minh")
    @Transactional
    public void expireDuePoints() {
        jdbc.sql("""
                WITH earn_lots AS (
                    SELECT l.id, l.customer_id, l.points_amount, l.expires_at, l.created_at,
                           COALESCE(SUM(l.points_amount) OVER (
                               PARTITION BY l.customer_id
                               ORDER BY l.expires_at, l.created_at, l.id
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS earned_before
                      FROM cashback_ledger l
                     WHERE l.entry_type = 'EARN' AND l.direction = 'CREDIT'
                       AND l.expires_at IS NOT NULL
                ), due_earn_lots AS (
                    SELECT e.*
                      FROM earn_lots e
                     WHERE e.expires_at <= now()
                       AND NOT EXISTS (SELECT 1 FROM cashback_ledger x
                                        WHERE x.source_entry_id = e.id AND x.entry_type = 'EXPIRY')
                ), used_points AS (
                    SELECT customer_id, SUM(points_amount) AS total_used
                      FROM cashback_ledger
                     WHERE direction = 'DEBIT' AND entry_type <> 'EXPIRY'
                     GROUP BY customer_id
                ), due AS (
                    SELECT e.id AS earn_id, e.customer_id, e.expires_at, e.created_at,
                           GREATEST(0, e.points_amount -
                               GREATEST(0, COALESCE(u.total_used, 0) - e.earned_before)) AS remaining
                      FROM due_earn_lots e
                      LEFT JOIN used_points u ON u.customer_id = e.customer_id
                ), due_running AS (
                    SELECT d.*,
                           COALESCE(SUM(d.remaining) OVER (
                               PARTITION BY d.customer_id
                               ORDER BY d.expires_at, d.created_at, d.earn_id
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_due
                      FROM due d
                ), locked_accounts AS MATERIALIZED (
                    SELECT ca.customer_id, ca.balance_points, ca.reserved_points
                      FROM cashback_account ca
                     WHERE ca.customer_id IN (SELECT DISTINCT customer_id FROM due_running)
                     FOR UPDATE
                ), expirable AS (
                    SELECT d.earn_id, d.customer_id,
                           CASE WHEN d.remaining > 0
                                      AND ca.balance_points - ca.reserved_points - d.prior_due >= d.remaining
                                THEN d.remaining ELSE 0 END AS amount
                      FROM due_running d
                      JOIN locked_accounts ca ON ca.customer_id = d.customer_id
                ), inserted AS (
                    INSERT INTO cashback_ledger
                        (customer_id, source_entry_id, entry_type, direction, points_amount,
                         idempotency_key, reason)
                    SELECT customer_id, earn_id, 'EXPIRY', 'DEBIT', amount,
                           'EXPIRY:' || earn_id::text, 'Quarterly KAS points expiration'
                      FROM expirable
                     WHERE amount > 0
                    ON CONFLICT (idempotency_key) DO NOTHING
                    RETURNING customer_id, points_amount
                ), expired_by_customer AS (
                    SELECT customer_id, SUM(points_amount) AS amount
                      FROM inserted GROUP BY customer_id
                )
                UPDATE cashback_account ca
                   SET balance_points = ca.balance_points - e.amount,
                       version = ca.version + 1, updated_at = now()
                  FROM expired_by_customer e
                 WHERE ca.customer_id = e.customer_id
                   AND ca.balance_points - ca.reserved_points >= e.amount
                """).update();
    }
}
