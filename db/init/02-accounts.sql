-- Accounts service database (added after Phase 1).
-- Fresh volumes run this automatically. On an existing volume run it once:
--   docker compose exec -T db psql -U postgres < db/init/02-accounts.sql
CREATE USER accounts_svc WITH PASSWORD 'accounts_dev';
CREATE DATABASE zil_accounts OWNER accounts_svc;
