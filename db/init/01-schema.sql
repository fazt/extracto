CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text        NOT NULL,
  mime_type    text        NOT NULL,
  size_bytes   bigint      NOT NULL,
  data         bytea       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC);

-- Borrador del análisis con el LLM de visión (los datos confirmados van a
-- las tablas de 02-registros.sql)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type    text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction  jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_at timestamptz;
