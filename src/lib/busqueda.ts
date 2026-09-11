import { pool } from "@/lib/db";
import { aVector } from "@/lib/embeddings";

export type Fragmento = {
  n: number;
  document_id: string;
  filename: string;
  tipo_documento: string;
  numero_documento: string | null;
  fecha_emision: string | null;
  emisor_nombre: string | null;
  texto: string;
  similitud: number;
};

/** Por debajo de esto el fragmento no habla de lo que se pregunta. */
export const SIMILITUD_MINIMA = 0.18;

const CONSULTA = `
  SELECT c.document_id,
         d.filename,
         r.tipo_documento,
         r.numero_documento,
         to_char(r.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
         r.emisor_nombre,
         c.texto,
         1 - (c.embedding <=> $1) AS similitud
    FROM documento_chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN registros r ON r.document_id = c.document_id
   ORDER BY c.embedding <=> $1
   LIMIT $2`;

/**
 * Fragmentos más parecidos a la consulta, ya numerados para citarlos.
 * Sólo mira documentos confirmados: el JOIN con `registros` los deja fuera.
 */
export async function buscarFragmentos(
  embeddingConsulta: number[],
  limite = 6,
): Promise<Fragmento[]> {
  const { rows } = await pool.query(CONSULTA, [aVector(embeddingConsulta), limite]);

  return (rows as Omit<Fragmento, "n">[])
    .filter((fila) => Number(fila.similitud) >= SIMILITUD_MINIMA)
    .map((fila, i) => ({ ...fila, n: i + 1, similitud: Number(fila.similitud) }));
}

/** Bloque de contexto que se le pasa al modelo, con las etiquetas de cita. */
export function construirContexto(fragmentos: Fragmento[]): string {
  return fragmentos
    .map((f) => {
      const cabecera = [
        f.tipo_documento,
        f.numero_documento && `nº ${f.numero_documento}`,
        f.fecha_emision,
        f.emisor_nombre,
        f.filename,
      ]
        .filter(Boolean)
        .join(" · ");

      return `[${f.n}] ${cabecera}\n${f.texto}`;
    })
    .join("\n\n---\n\n");
}

/** Datos de cita de documentos concretos, para las respuestas calculadas con SQL. */
export async function fuentesPorDocumento(
  documentIds: string[],
): Promise<Omit<Fragmento, "texto" | "similitud">[]> {
  if (documentIds.length === 0) return [];

  const { rows } = await pool.query(
    `SELECT r.document_id,
            d.filename,
            r.tipo_documento,
            r.numero_documento,
            to_char(r.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
            r.emisor_nombre
       FROM registros r
       JOIN documents d ON d.id = r.document_id
      WHERE r.document_id = ANY($1::uuid[])
      ORDER BY r.fecha_emision NULLS LAST`,
    [documentIds],
  );

  return rows.map((fila, i) => ({ ...fila, n: i + 1 }));
}
