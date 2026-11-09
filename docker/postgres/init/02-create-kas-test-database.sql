-- Dedicated integration-test database, separate from kas_web_dev so test
-- fixtures never land in development data. Same owner role as the dev
-- database (created by 01-create-kas-database.sql), so no new credential.
--
-- Init scripts only run on an empty volume. For an existing container, create
-- it once with:
--   docker exec kas-postgres psql -U postgres -c "CREATE DATABASE kas_web_test OWNER kas_web_app"
-- then build its schema with TestDatabaseMigration (see docs/kas/00-README.md).
CREATE DATABASE kas_web_test OWNER kas_web_app;
