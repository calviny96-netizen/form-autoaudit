ALTER TABLE campaigns ADD COLUMN duplicate_rule jsonb NOT NULL DEFAULT '{"enabled":true,"fields":["email"],"match":"any","message":"This email already has an active booking in this calendar."}';
UPDATE campaigns SET duplicate_rule=jsonb_set(duplicate_rule,'{enabled}','false') WHERE NOT coalesce((standard_fields->'email'->>'enabled')::boolean,true);
-- Duplicate rules are enforced inside the existing company row lock, including when disabled.
DROP INDEX bookings_active_email;
CREATE INDEX bookings_email_lookup ON bookings(campaign_id,email) WHERE status<>'cancelled' AND email<>'';
CREATE INDEX form_responses_completed ON form_responses(form_id) WHERE status='completed';
