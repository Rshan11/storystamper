-- StoryStamper accounts schema

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  apple_sub TEXT UNIQUE,
  apple_refresh_token TEXT,
  display_name TEXT,
  invite_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL
);

-- One row per user per UTC day
CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Failed login tracking for brute-force protection
CREATE TABLE login_failures (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_failures_key ON login_failures(key, at);
