// Postgres access. Each service owns its own database (database-per-service);
// the connection string is the only thing that ties the code to an environment.
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000
});

export const query = (text, params) => pool.query(text, params);
