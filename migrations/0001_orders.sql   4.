PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  txnid TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  bump INTEGER NOT NULL DEFAULT 0 CHECK (bump IN (0, 1)),
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('initiated', 'paid', 'failed', 'initiation_failed')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS download_tokens (
  token TEXT PRIMARY KEY,
  txnid TEXT NOT NULL REFERENCES orders(txnid),
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 5,
  downloads INTEGER NOT NULL DEFAULT 0,
  UNIQUE (txnid, object_key)
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_txnid ON download_tokens(txnid);
