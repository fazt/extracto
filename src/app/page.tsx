import { pool } from "@/lib/db";
import { listarRegistros, type Registro } from "@/lib/registros";
import Uploader, { type Doc } from "./uploader";

export const dynamic = "force-dynamic";

export default async function Home() {
  let docs: Doc[] = [];
  let registros: Registro[] = [];
  let dbError: string | null = null;

  try {
    const { rows } = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, created_at, doc_type, extraction
         FROM documents
        ORDER BY created_at DESC
        LIMIT 50`,
    );
    docs = rows as Doc[];
    registros = await listarRegistros();
  } catch {
    dbError =
      "No hay conexión con PostgreSQL. ¿Levantaste la base con `docker compose up -d`?";
  }

  return <Uploader initialDocs={docs} initialRegistros={registros} dbError={dbError} />;
}
