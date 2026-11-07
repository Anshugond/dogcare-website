CREATE TABLE IF NOT EXISTS meta_capi_events (
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, event_name)
);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_created_at ON meta_capi_events(created_at);
