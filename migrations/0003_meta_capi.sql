-- Meta Conversions API attribution and idempotency fields.
ALTER TABLE orders ADD COLUMN meta_pixel_id TEXT;
ALTER TABLE orders ADD COLUMN meta_fbp TEXT;
ALTER TABLE orders ADD COLUMN meta_fbc TEXT;
ALTER TABLE orders ADD COLUMN client_ip_address TEXT;
ALTER TABLE orders ADD COLUMN client_user_agent TEXT;
ALTER TABLE orders ADD COLUMN capi_claimed_at INTEGER;
ALTER TABLE orders ADD COLUMN capi_sent_at INTEGER;
