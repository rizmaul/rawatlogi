CREATE TABLE IF NOT EXISTS records (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('product','evidence','post')),
 data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind, updated_at);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 payload TEXT NOT NULL CHECK(json_valid(payload)), result TEXT, error TEXT,
 claim_token TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
