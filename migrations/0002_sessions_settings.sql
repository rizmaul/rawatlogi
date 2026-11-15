CREATE TABLE IF NOT EXISTS app_settings (
 id TEXT PRIMARY KEY CHECK(id='ai'), data TEXT NOT NULL CHECK(json_valid(data)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('research','writing')),
 product_id TEXT NOT NULL REFERENCES records(id), topic TEXT NOT NULL CHECK(json_valid(topic)), guidance TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('queued','in_progress','completed','failed')), progress TEXT NOT NULL DEFAULT 'Queued',
 job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id), result TEXT, sources TEXT NOT NULL DEFAULT '[]', error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_product ON sessions(product_id,kind,created_at);
CREATE INDEX IF NOT EXISTS sessions_job ON sessions(job_id);
