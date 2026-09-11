/** Esquema que se le enseña al modelo para que escriba las consultas. */
export const ESQUEMA = `registros (un documento confirmado)
  id uuid, document_id uuid, tipo_documento text ('factura'|'recibo'|'contrato'|'otro'),
  resumen text, idioma text, numero_documento text,
  fecha_emision date, fecha_vencimiento date, moneda text,
  subtotal numeric, impuestos numeric, total numeric, metodo_pago text,
  emisor_nombre text, emisor_nif text, emisor_direccion text,
  receptor_nombre text, receptor_nif text, receptor_direccion text,
  confirmado_at timestamptz

registro_lineas (conceptos de facturas y recibos)
  id uuid, registro_id uuid -> registros.id, orden int,
  descripcion text, cantidad numeric, precio_unitario numeric, importe numeric

registro_contratos (detalle de los contratos)
  registro_id uuid -> registros.id, objeto text,
  fecha_inicio date, fecha_fin date, duracion text, importe text,
  ley_aplicable text, clausulas_destacadas text[]

documents (el archivo original)
  id uuid, filename text, mime_type text, size_bytes bigint, created_at timestamptz`;

export const REGLAS_SQL = `Reglas para el SQL:
- PostgreSQL. Una sola sentencia SELECT, sin punto y coma final ni comentarios.
- Incluye SIEMPRE r.document_id en el SELECT (o array_agg(DISTINCT r.document_id) en
  las agregaciones) para poder citar los documentos de origen.
- Los importes de contratos son texto libre: no los sumes.
- Usa alias claros en las columnas calculadas (por ejemplo AS total_facturado).
- No inventes columnas: usa sólo las del esquema.`;
