-- Zil Studio: editing metadata on places, and time-bound events (night markets, festivals, food fairs).
ALTER TABLE places ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE places ADD COLUMN IF NOT EXISTS updated_by text;

CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  cat           text NOT NULL REFERENCES categories(id),
  place_id      text REFERENCES places(id) ON DELETE SET NULL,  -- at a curated place...
  lat           double precision,                                -- ...or its own pin
  lon           double precision,
  venue         text NOT NULL DEFAULT '' CHECK (char_length(venue) <= 80),
  blurb         text NOT NULL DEFAULT '' CHECK (char_length(blurb) <= 600),
  price         text NOT NULL DEFAULT '' CHECK (char_length(price) <= 60),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  repeat_weekly boolean NOT NULL DEFAULT false,                  -- same weekday and hours every week
  repeat_until  date,
  translations  jsonb NOT NULL DEFAULT '{}',                     -- {"fr": {"title": ..., "blurb": ...}}
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  CHECK (ends_at > starts_at),
  CHECK (place_id IS NOT NULL OR (lat IS NOT NULL AND lon IS NOT NULL))
);
CREATE INDEX events_window_idx ON events (published, starts_at, ends_at);
