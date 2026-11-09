-- Close late-cancellation requests at noon on the hotel's local check-in date.
-- The reservation itself remains active unless the customer accepted a quote.

ALTER TYPE cancellation_request_status ADD VALUE 'EXPIRED';
