-- A guest reviews a stay once it is checked out (2026-11-14).
--
-- V33 let a review be stored only for a stay in COMPLETED. Nothing in the product moves a
-- stay to COMPLETED: check-out (StayTransitionService, V59) ends at CHECKED_OUT, which the
-- membership tier and the loyalty points already count as a finished stay
-- ('CHECKED_OUT', 'COMPLETED'). So no guest could ever review. A review now needs a stay
-- that is CHECKED_OUT or COMPLETED; the customer / property match is unchanged.
CREATE OR REPLACE FUNCTION kas_require_completed_review_stay()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    stay_customer_id uuid;
    stay_property_id uuid;
    stay_state stay_status;
BEGIN
    SELECT customer_id, property_id, stay_status
      INTO stay_customer_id, stay_property_id, stay_state
      FROM reservation
     WHERE id = NEW.reservation_id;

    IF NOT FOUND OR stay_state IS NULL OR stay_state NOT IN ('CHECKED_OUT', 'COMPLETED') THEN
        RAISE EXCEPTION 'review requires a completed stay';
    END IF;
    IF stay_customer_id IS DISTINCT FROM NEW.customer_id
       OR stay_property_id IS DISTINCT FROM NEW.property_id THEN
        RAISE EXCEPTION 'review customer and property must match its reservation';
    END IF;
    RETURN NEW;
END;
$$;
