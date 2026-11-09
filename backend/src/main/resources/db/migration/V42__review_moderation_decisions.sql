-- external_url and its mutually exclusive storage source already exist in V33.
ALTER TABLE review_moderation_event DROP CONSTRAINT review_moderation_action;
ALTER TABLE review_moderation_event ADD CONSTRAINT review_moderation_action
    CHECK (action IN ('APPROVE', 'REJECT', 'HIDE', 'SHOW', 'DELETE'));
