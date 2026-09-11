import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ExtraccionBrutaSchema, validarExtraccion } from "@/lib/schemas";

export const runtime = "nodejs";

/** Guarda las correcciones manuales del formulario. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cuerpo = await request.json().catch(() => null);

  const parsed = ExtraccionBrutaSchema.safeParse(cuerpo?.extraction);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "La extracción enviada no tiene la forma esperada",
        problemas: parsed.error.issues.slice(0, 10),
      },
      { status: 400 },
    );
  }

  const extraccion = parsed.data;
  // Se guardan también las extracciones con problemas: son correcciones en curso.
  const validacion = validarExtraccion(extraccion);

  const { rowCount } = await pool.query(
    `UPDATE documents
        SET doc_type = $2, extraction = $3, extracted_at = now()
      WHERE id = $1`,
    [id, extraccion.tipo_documento, JSON.stringify(extraccion)],
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return NextResponse.json({ id, extraction: extraccion, validacion });
}
