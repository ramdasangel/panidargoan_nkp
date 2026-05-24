-- Runs once when the postgres data volume is first initialized.
-- The PostGIS image leaves public schema owned by pg_database_owner (PG15+ default),
-- which trips Prisma's permission check (P1010). Transferring ownership to the app
-- user resolves it without weakening defaults for other databases.
ALTER SCHEMA public OWNER TO panidargoan;
