-- Push notifications: one row per app install that allowed notifications (FCM registration token).
CREATE TABLE push_devices (
  token       text PRIMARY KEY CHECK (char_length(token) BETWEEN 20 AND 4096),
  platform    text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

-- What the team sent, for the Studio history.
CREATE TABLE push_log (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  body        text NOT NULL,
  place_id    text,
  sent_by     text,
  sent        int NOT NULL DEFAULT 0,
  failed      int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
