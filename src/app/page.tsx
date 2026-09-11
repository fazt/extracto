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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Extracto</h1>
        <p className="text-sm text-muted">
          Sube una imagen o un PDF, revisa los datos y confírmalos: se guardan en tablas
          de PostgreSQL y su texto queda indexado con pgvector.
        </p>
      </header>

      <Uploader initialDocs={docs} initialRegistros={registros} dbError={dbError} />
    </main>
  );
}
