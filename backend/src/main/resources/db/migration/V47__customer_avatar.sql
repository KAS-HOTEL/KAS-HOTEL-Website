-- V47 — Customer profile photo, stored with the account.
--
-- Until now the photo lived only in one browser's localStorage, so it was lost on
-- another device, shared between accounts on the same browser, and never reached
-- the site header. One row per customer; the image is the already-resized JPEG/PNG/
-- WebP the website uploads (at most 512 KiB). `version` increases on every change
-- and is put in the image URL, so a browser never shows a cached old photo.
--
-- Additive only. Rollback: DROP TABLE customer_avatar;  (no other object depends on it)

CREATE TABLE customer_avatar (
    customer_id  uuid        PRIMARY KEY REFERENCES customer (id) ON DELETE CASCADE,
    content_type text        NOT NULL,
    image        bytea       NOT NULL,
    version      integer     NOT NULL DEFAULT 1,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_avatar_type_valid CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT customer_avatar_size_valid CHECK (octet_length(image) BETWEEN 1 AND 524288),
    CONSTRAINT customer_avatar_version_positive CHECK (version > 0)
);

COMMENT ON TABLE customer_avatar IS
    'Customer profile photo. Served to its owner at /api/v1/me/profile/avatar and to staff at /api/v1/admin/customers/{id}/avatar.';
