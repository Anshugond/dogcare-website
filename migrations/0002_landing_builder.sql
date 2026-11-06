PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS landing_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

ALTER TABLE orders ADD COLUMN page_slug TEXT;
ALTER TABLE orders ADD COLUMN product_name TEXT;
ALTER TABLE orders ADD COLUMN main_object_key TEXT;
ALTER TABLE orders ADD COLUMN bump_object_key TEXT;
ALTER TABLE orders ADD COLUMN bump_product_name TEXT;

CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status);
CREATE INDEX IF NOT EXISTS idx_orders_page_slug ON orders(page_slug);
