-- Only binary attachments expire; response text and original file names remain available.
ALTER TABLE form_files ADD COLUMN expires_at timestamptz;
UPDATE form_files SET expires_at=created_at+interval '30 days';
ALTER TABLE form_files ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE form_files ALTER COLUMN expires_at SET DEFAULT (now()+interval '30 days');
ALTER TABLE form_files ADD COLUMN deleted_at timestamptz;
CREATE INDEX form_files_expiry ON form_files(expires_at) WHERE deleted_at IS NULL;
