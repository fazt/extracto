import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, size_bytes, created_at
       FROM documents
      ORDER BY created_at DESC
      LIMIT 50`,
  );
  return NextResponse.json(rows);
}
