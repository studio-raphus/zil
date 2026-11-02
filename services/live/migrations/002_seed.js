import { readFile } from 'node:fs/promises';

export async function up(c) {
  const { live } = JSON.parse(await readFile(new URL('../seed/places.json', import.meta.url), 'utf8'));
  for (const [id, text, hot] of live.status) {
    await c.query('INSERT INTO live_status (place_id, text, hot) VALUES ($1,$2,$3) ON CONFLICT (place_id) DO NOTHING', [id, text, hot]);
  }
  for (const [id, minutesAgo] of live.feed) {
    await c.query(
      `INSERT INTO live_feed (place_id, text, created_at)
       SELECT place_id, text, now() - make_interval(mins => $2) FROM live_status WHERE place_id = $1`, [id, minutesAgo]);
  }
}
