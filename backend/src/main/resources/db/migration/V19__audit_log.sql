-- =============================================================================
-- V19 — Audit log  (APPEND-ONLY)
-- Source: 53-phase-4-database-erd.md §6, 59-phase-4-rbac.md §7
-- =============================================================================
-- Append-only by design. No UPDATE or DELETE privilege is granted on this
-- table, even to the application role (doc 52 §3.18).
--
-- A rule enforced only by convention is not enforced. The trigger below makes
-- the append-only property a database guarantee.
-- =============================================================================

CREATE TABLE audit_log (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    actor_role  user_role,
    action      text        NOT NULL,
    entity_type text        NOT NULL,
    entity_id   uuid,
    before_state jsonb,
    after_state  jsonb,
    reason      text,
    ip          inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_action_not_blank CHECK (length(btrim(action)) > 0)
);

COMMENT ON TABLE audit_log IS
    'APPEND-ONLY. UPDATE and DELETE are blocked by trigger AND by revoked privilege.';

CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_actor_idx  ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_created_idx ON audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only enforcement. Blocks UPDATE and DELETE for EVERY role including
-- the table owner — privilege revocation alone does not restrain an owner.
-- ---------------------------------------------------------------------------
CREATE FUNCTION audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

COMMENT ON FUNCTION audit_log_append_only() IS
    'Raises on any UPDATE or DELETE. Makes append-only a database guarantee, not a convention.';
