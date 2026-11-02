CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE categories (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  one         text NOT NULL,
  color       text NOT NULL,
  icon        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE places (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  short        text NOT NULL,
  cat          text NOT NULL REFERENCES categories(id),
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  geom         geography(Point, 4326) NOT NULL,
  time_needed  text,
  best_time    text,
  cost         text,
  blurb        text,
  fact         text,
  tips         jsonb NOT NULL DEFAULT '[]',
  tags         text NOT NULL DEFAULT '',
  translations jsonb NOT NULL DEFAULT '{}',   -- {"fr": {"name": ..., "blurb": ...}} for i18n
  extras       jsonb NOT NULL DEFAULT '{}',   -- phase-2 data (experiences, ar scenes) without schema churn
  published    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX places_geom_idx ON places USING gist (geom);
CREATE INDEX places_cat_idx  ON places (cat);
