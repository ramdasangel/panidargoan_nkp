FROM postgis/postgis:16-3.4
# Baked-in init script; runs once on first cluster initialization.
# Transfers public-schema ownership to the app user so Prisma's P1010
# check passes (PostGIS image leaves it on pg_database_owner).
COPY init.sql /docker-entrypoint-initdb.d/10-init.sql
