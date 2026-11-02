CREATE TABLE spots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   text NOT NULL,                    -- anonymous owner id (phase 2: user accounts)
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  cat         text NOT NULL,
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  lat         double precision NOT NULL,
  lon         double precision NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX spots_status_idx ON spots (status);
CREATE INDEX spots_device_idx ON spots (device_id);
