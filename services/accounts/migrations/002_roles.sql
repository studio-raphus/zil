-- Studio roles: user (default, the public app), editor (places, events, live, moderation), admin (+ team).
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin'));
