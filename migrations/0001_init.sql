-- South Block schema. Content tables are filled by seed/seed.sql; submission tables by the API.

CREATE TABLE categories (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  color          TEXT NOT NULL,                 -- '#RRGGBB'
  dark_text      INTEGER NOT NULL DEFAULT 0,    -- 1 = use dark text on the colour (yellow)
  divider_before INTEGER NOT NULL DEFAULT 0,
  intro          TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,                 -- = Flutter Item.imageKey, e.g. 'warrior-bowl', 'wrap-tandoori-chicken'
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL,                    -- bowl|mini|cup|toast|juice|bottle|can|bag|pot|ibowl|sauce|roti|wrap|hot|cookie|bar|crisps
  color_a     TEXT NOT NULL,
  color_b     TEXT NOT NULL,
  tag         TEXT NOT NULL DEFAULT '',         -- dietary tags, e.g. 'DF, GF'
  price_cents INTEGER,                          -- NULL = not priced yet (edit via admin API)
  calories    INTEGER,
  image_url   TEXT,                             -- optional photo that overrides automatic photos
  is_active   INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An item can appear in several categories (and under different section headings).
CREATE TABLE category_items (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  section     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL,
  PRIMARY KEY (category_id, item_id, section)
);
CREATE INDEX idx_category_items_cat ON category_items (category_id, sort_order);

-- Home page chips (Seasonal, Protein Picks, ...) and the items their carousel shows.
CREATE TABLE home_categories (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  link_category_id TEXT NOT NULL REFERENCES categories(id),
  icon_item_id     TEXT NOT NULL REFERENCES items(id),
  sort_order       INTEGER NOT NULL
);
CREATE TABLE home_category_items (
  home_category_id TEXT NOT NULL REFERENCES home_categories(id) ON DELETE CASCADE,
  item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  PRIMARY KEY (home_category_id, item_id)
);

CREATE TABLE testimonials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  author     TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT NOT NULL,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  hours      TEXT NOT NULL DEFAULT '',
  lat        REAL,
  lng        REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- Page copy and settings kept in the database (value is JSON).
CREATE TABLE site_content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- form submissions ----------
CREATE TABLE catering_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  event_date  TEXT,
  guests      INTEGER NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  ip_hash     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE job_applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  position     TEXT NOT NULL,
  location_id  TEXT REFERENCES locations(id),
  availability TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'new',
  ip_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rewards_signups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Used only for rate limiting (max 5 form posts per hour per visitor).
CREATE TABLE submission_log (
  ip_hash    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_submission_log ON submission_log (ip_hash, created_at);
