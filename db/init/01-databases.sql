-- Database-per-service: each service gets its own database and login.
-- Passwords here are for local development only; use secrets in any shared environment.
CREATE USER catalog_svc WITH PASSWORD 'catalog_dev';
CREATE USER spots_svc   WITH PASSWORD 'spots_dev';
CREATE USER live_svc    WITH PASSWORD 'live_dev';

CREATE DATABASE zil_catalog OWNER catalog_svc;
CREATE DATABASE zil_spots   OWNER spots_svc;
CREATE DATABASE zil_live    OWNER live_svc;

-- PostGIS must be created by a superuser; the catalog migration then finds it already present.
\connect zil_catalog
CREATE EXTENSION IF NOT EXISTS postgis;
