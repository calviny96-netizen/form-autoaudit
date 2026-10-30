-- Final retention policy: thirty days from upload; text responses are preserved.
ALTER TABLE form_files ALTER COLUMN expires_at SET DEFAULT (now()+interval '30 days');
UPDATE form_files SET expires_at=created_at+interval '30 days' WHERE deleted_at IS NULL;
CREATE INDEX form_files_unused_cleanup ON form_files(created_at) WHERE deleted_at IS NULL;
