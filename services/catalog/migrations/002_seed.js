// Seeds categories and the 19 launch places from ../seed/places.json (the same file the
// frontend ships as its offline fallback).
import { readFile } from 'node:fs/promises';

export async function up(c) {
  const seed = JSON.parse(await readFile(new URL('../seed/places.json', import.meta.url), 'utf8'));
  for (const [i, k] of seed.categories.entries()) {
    await c.query('INSERT INTO categories (id,label,one,color,icon,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
      [k.id, k.label, k.one, k.color, k.icon, i]);
  }
  for (const [i, p] of seed.places.entries()) {
    await c.query(
      `INSERT INTO places (id,name,short,cat,lat,lon,geom,time_needed,best_time,cost,blurb,fact,tips,tags,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($6,$5),4326)::geography,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.short, p.cat, p.lat, p.lon, p.time, p.best, p.cost, p.blurb, p.fact, JSON.stringify(p.tips || []), p.tags || '', i]);
  }
}
