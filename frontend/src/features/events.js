// Events on the public map: night markets, festivals, food fairs from the catalog's events feed.
// Each event shows once (its next occurrence) as a pin with a blue "when" badge; pins of events
// happening right now glow like live places.
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').toLowerCase();

export function whenLabel(e, now = new Date()) {
  const s = new Date(e.starts_at), end = new Date(e.ends_at);
  if (s <= now && end > now) return `On now · till ${hm(end)}`;
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const days = Math.floor((s - day0) / 86400000);
  if (days === 0) return `${s.getHours() >= 17 ? 'Tonight' : 'Today'} ${hm(s)}`;
  if (days === 1) return `Tomorrow ${hm(s)}`;
  return `${DAY[s.getDay()]} ${hm(s)}`;
}

/** One entry per event (the next occurrence), shaped like a place so pins/search/sheet just work. */
export function eventsToPlaces(list, placePosition) {
  const seen = new Set(), out = [], now = new Date();
  for (const e of list) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    const p = placePosition({
      id: `ev-${e.id}`, event: true, name: e.title, short: e.title.length > 22 ? e.title.slice(0, 21) + '…' : e.title,
      cat: e.cat, lat: e.lat, lon: e.lon, blurb: e.blurb, price: e.price, venue: e.place_name || e.venue || '',
      place_id: e.place_id, starts_at: e.starts_at, ends_at: e.ends_at, recurring: e.repeat_weekly,
      live: whenLabel(e, now), hot: new Date(e.starts_at) <= now && new Date(e.ends_at) > now, tags: 'event'
    });
    if (e.place_id) p.pos.x += 0.5; // sit beside the place's own pin rather than on top of it
    out.push(p);
  }
  return out;
}
