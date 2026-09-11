/**
 * Aplica db/init/*.sql en orden contra DATABASE_URL.
 *
 * En local lo hace el entrypoint de Docker la primera vez que se crea el
 * volumen; en producción no hay tal cosa, así que el arranque de la app pasa
 * por aquí. Todo el SQL es idempotente (IF NOT EXISTS), de modo que volver a
 * ejecutarlo en cada despliegue no rompe nada.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
const directorio = join(aqui, "..", "db", "init");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] Falta DATABASE_URL");
  process.exit(1);
}

// Los Postgres gestionados suelen servir un certificado propio: se cifra la
// conexión pero no se verifica la cadena.
const ssl =
  process.env.DATABASE_SSL === "off"
    ? false
    : /sslmode=require|DATABASE_SSL=on/.test(`${url}${process.env.DATABASE_SSL ?? ""}`)
      ? { rejectUnauthorized: false }
      : false;

const cliente = new pg.Client({ connectionString: url, ssl });

const archivos = readdirSync(directorio)
  .filter((f) => f.endsWith(".sql"))
  .sort();

try {
  await cliente.connect();

  for (const archivo of archivos) {
    const sql = readFileSync(join(directorio, archivo), "utf8");
    process.stdout.write(`[migrate] ${archivo}… `);
    await cliente.query(sql);
    console.log("ok");
  }

  const { rows } = await cliente.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  console.log(`[migrate] pgvector ${rows[0]?.extversion ?? "NO DISPONIBLE"}`);
} catch (err) {
  console.error(`\n[migrate] falló: ${err.message}`);
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}
