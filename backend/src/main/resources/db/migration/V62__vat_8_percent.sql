-- V62 — VAT 8% on every direct booking (owner decision 2026-11-09).
--
-- The owner approved the booking price demo with VAT and without a service charge:
-- room amount − voucher, then VAT 8% on top ("++" rates: the rates typed in the console
-- exclude VAT). One global rule; a property that needs another rate gets its own row,
-- which replaces this one for that property (StayAdjustmentService).
--
-- Only when no VAT rule is active yet, so re-running against a database where someone
-- already set VAT by hand changes nothing.

INSERT INTO tax_rule (property_id, tax_type, calculation, value, applies_to, is_inclusive, sort_order, status)
SELECT NULL, 'VAT', 'PERCENTAGE', 8, 'ROOM_SUBTOTAL', false, 10, 'ACTIVE'
 WHERE NOT EXISTS (SELECT 1 FROM tax_rule WHERE tax_type = 'VAT' AND status = 'ACTIVE');
