import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo no permitido: ${file.type || "desconocido"}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera los 20 MB" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const { rows } = await pool.query(
    `INSERT INTO documents (filename, mime_type, size_bytes, data)
     VALUES ($1, $2, $3, $4)
     RETURNING id, filename, mime_type, size_bytes, created_at`,
    [file.name, file.type, file.size, bytes],
  );

  return NextResponse.json(rows[0], { status: 201 });
}
