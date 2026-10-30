ALTER TABLE campaigns ADD COLUMN standard_fields jsonb NOT NULL DEFAULT '{"name":{"enabled":true,"required":true},"email":{"enabled":true,"required":true},"phone":{"enabled":true,"required":true}}';
DROP INDEX bookings_active_email;
CREATE UNIQUE INDEX bookings_active_email ON bookings(campaign_id,email) WHERE status<>'cancelled' AND email<>'';
