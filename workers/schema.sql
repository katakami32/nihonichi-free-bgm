-- D1 schema for Free BGM site
-- 既存DBに対しても安全に流せるよう IF NOT EXISTS を多用

CREATE TABLE IF NOT EXISTS genres (
  slug       TEXT PRIMARY KEY,
  label_ja   TEXT NOT NULL,
  label_en   TEXT NOT NULL,
  cover      TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS songs (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  genre       TEXT NOT NULL,
  description TEXT,
  tags        TEXT,
  duration    REAL,
  bpm         REAL,
  model       TEXT,
  audio_key   TEXT NOT NULL,
  image_key   TEXT,
  bpm_bucket  TEXT GENERATED ALWAYS AS
    (CASE WHEN bpm IS NULL THEN 'unknown'
          WHEN bpm < 80   THEN 'slow'
          WHEN bpm < 120  THEN 'mid'
          ELSE                 'fast' END) STORED,
  dur_bucket  TEXT GENERATED ALWAYS AS
    (CASE WHEN duration IS NULL THEN 'unknown'
          WHEN duration < 30   THEN 'short'
          WHEN duration < 120  THEN 'mid'
          ELSE                      'long' END) STORED,
  created_at      TEXT NOT NULL,
  download_count  INTEGER DEFAULT 0,
  play_count      INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_songs_genre   ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_songs_created ON songs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_bpm     ON songs(bpm_bucket);
CREATE INDEX IF NOT EXISTS idx_songs_dur     ON songs(dur_bucket);
CREATE INDEX IF NOT EXISTS idx_songs_dl      ON songs(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_songs_play    ON songs(play_count DESC);

-- ───── 全文検索 (FTS5 + trigram) ─────
-- 日本語の部分一致を効かせるため trigram トークナイザを使う。
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
  title, description, tags, genre,
  content='songs', content_rowid='rowid',
  tokenize='trigram'
);

-- songs から fts への自動同期
DROP TRIGGER IF EXISTS songs_ai;
DROP TRIGGER IF EXISTS songs_ad;
DROP TRIGGER IF EXISTS songs_au;

CREATE TRIGGER songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO songs_fts(rowid, title, description, tags, genre)
    VALUES (new.rowid, new.title, new.description, new.tags, new.genre);
END;

CREATE TRIGGER songs_ad AFTER DELETE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, description, tags, genre)
    VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.genre);
END;

CREATE TRIGGER songs_au AFTER UPDATE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, description, tags, genre)
    VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.genre);
  INSERT INTO songs_fts(rowid, title, description, tags, genre)
    VALUES (new.rowid, new.title, new.description, new.tags, new.genre);
END;
