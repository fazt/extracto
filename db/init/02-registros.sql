-- Datos confirmados: lo que el usuario ha revisado pasa de `documents.extraction`
-- (jsonb, borrador) a tablas relacionales consultables.

CREATE TABLE IF NOT EXISTS registros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  tipo_documento    text NOT NULL
                    CHECK (tipo_documento IN ('factura', 'recibo', 'contrato', 'otro')),
  resumen           text NOT NULL,
  idioma            text,
  numero_documento  text,
  fecha_emision     date,
  fecha_vencimiento date,
  moneda            text,
  subtotal          numeric(14, 2),
  impuestos         numeric(14, 2),
  total             numeric(14, 2),
  metodo_pago       text,
  emisor_nombre     text,
  emisor_nif        text,
  emisor_direccion  text,
  receptor_nombre   text,
  receptor_nif      text,
  receptor_direccion text,
  confirmado_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registros_tipo_idx ON registros (tipo_documento);
CREATE INDEX IF NOT EXISTS registros_fecha_idx ON registros (fecha_emision DESC);
CREATE INDEX IF NOT EXISTS registros_emisor_idx ON registros (emisor_nombre);

CREATE TABLE IF NOT EXISTS registro_lineas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id     uuid NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
  orden           integer NOT NULL,
  descripcion     text NOT NULL,
  cantidad        numeric(14, 3),
  precio_unitario numeric(14, 4),
  importe         numeric(14, 2),
  UNIQUE (registro_id, orden)
);

CREATE TABLE IF NOT EXISTS registro_contratos (
  registro_id          uuid PRIMARY KEY REFERENCES registros(id) ON DELETE CASCADE,
  objeto               text,
  fecha_inicio         date,
  fecha_fin            date,
  duracion             text,
  importe              text,
  ley_aplicable        text,
  clausulas_destacadas text[] NOT NULL DEFAULT '{}'
);

-- Texto del documento troceado, con su embedding para búsqueda semántica.
CREATE TABLE IF NOT EXISTS documento_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  orden       integer NOT NULL,
  texto       text NOT NULL,
  embedding   vector(1536) NOT NULL,
  creado_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, orden)
);

CREATE INDEX IF NOT EXISTS documento_chunks_embedding_idx
  ON documento_chunks USING hnsw (embedding vector_cosine_ops);
