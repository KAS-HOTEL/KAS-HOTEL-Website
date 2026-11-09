-- A5 / OQ-045 was explicitly resolved for V1: the operator may record no-show
-- at the end of the property's check-in date. All V1 properties use Vietnam time.
INSERT INTO system_setting (key, value, value_type, scope, property_id,
                            description, source_ref, required_by)
VALUES ('NO_SHOW_CUTOFF', '23:59', 'STRING', 'GLOBAL', NULL,
        'Local time after which an operator may mark a guest absent as no-show. V1 cutoff: 23:59 Asia/Ho_Chi_Minh. Never automatic.',
        'A5 / OQ-045', 'PRODUCTION')
ON CONFLICT (key) DO UPDATE
   SET value = EXCLUDED.value,
       description = EXCLUDED.description,
       updated_at = clock_timestamp();
