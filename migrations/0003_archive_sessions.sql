-- Sessions are retired historical data. Preserve their original product IDs
-- without preventing deletion of products that have no live evidence or posts.
CREATE TABLE sessions_archive (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('research','writing')),
 product_id TEXT NOT NULL, topic TEXT NOT NULL CHECK(json_valid(topic)), guidance TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('queued','in_progress','completed','failed')), progress TEXT NOT NULL DEFAULT 'Queued',
 job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id), result TEXT, sources TEXT NOT NULL DEFAULT '[]', error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO sessions_archive SELECT * FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_archive RENAME TO sessions;
CREATE INDEX sessions_product ON sessions(product_id,kind,created_at);
CREATE INDEX sessions_job ON sessions(job_id);
