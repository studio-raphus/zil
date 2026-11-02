-- Live layer: the current status line per place, and an append-only feed of updates.
CREATE TABLE live_status (
  place_id    text PRIMARY KEY,
  text        text NOT NULL CHECK (char_length(text) <= 60),
  hot         boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE live_feed (
  id          bigserial PRIMARY KEY,
  place_id    text NOT NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_feed_created_idx ON live_feed (created_at DESC);
