import { Pool } from "pg";

const globalForPool = globalThis as unknown as { pool?: Pool };

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://extracto:extracto@localhost:5435/extracto";

// Los Postgres gestionados sirven un certificado propio: se cifra la conexión
// pero no se verifica la cadena. En local (sin sslmode) se conecta en claro.
const ssl =
  process.env.DATABASE_SSL === "off"
    ? false
    : /sslmode=require/.test(connectionString) || process.env.DATABASE_SSL === "on"
      ? { rejectUnauthorized: false }
      : false;

export const pool =
  globalForPool.pool ??
  new Pool({
    connectionString,
    ssl,
    // El paquete Basic admite 20 conexiones; se deja margen para migraciones.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });

if (process.env.NODE_ENV !== "production") globalForPool.pool = pool;

export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
};
