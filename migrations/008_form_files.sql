-- Files belong to a respondent's existing response and company. Content stays in private storage.
ALTER TABLE form_responses ADD CONSTRAINT form_responses_file_owner UNIQUE(company_id,form_id,id);
CREATE TABLE form_files (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  form_id uuid NOT NULL,
  response_id uuid NOT NULL,
  block_id text NOT NULL CHECK (block_id ~ '^[a-zA-Z0-9_-]{1,40}$'),
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 180),
  storage_name text NOT NULL UNIQUE CHECK (storage_name ~ '^[a-f0-9-]{36}$'),
  extension text NOT NULL CHECK (extension IN ('jpeg','jpg','png','svg','pdf','md','doc','docx','xlsx','csv')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,form_id,response_id) REFERENCES form_responses(company_id,form_id,id) ON DELETE CASCADE
);
CREATE INDEX form_files_response ON form_files(company_id,form_id,response_id);
CREATE INDEX form_files_created ON form_files(created_at);
