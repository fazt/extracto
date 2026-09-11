import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ExtraccionBrutaSchema, validarExtraccion } from "@/lib/schemas";
import { aVector, embeber, textoDeRespaldo, trocear } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Las fechas van a columnas `date`: una cadena vacía rompería el INSERT. */
function fecha(valor: string | null | undefined): string | null {
  return valor && valor.trim() !== "" ? valor : null;
}

export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({ id: null }));
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta el id del documento" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT extraction FROM documents WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const parsed = ExtraccionBrutaSchema.safeParse(rows[0].extraction);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Este documento todavía no tiene datos extraídos" },
      { status: 409 },
    );
  }

  const datos = parsed.data;
  const validacion = validarExtraccion(datos);
  if (!validacion.valido) {
    return NextResponse.json(
      { error: "Corrige los campos marcados antes de confirmar", validacion },
      { status: 422 },
    );
  }

  // Los embeddings se piden antes de abrir la transacción: si el proveedor
  // falla, no dejamos una transacción abierta esperando por la red.
  const texto = datos.texto?.trim() ? datos.texto : textoDeRespaldo(datos);
  const trozos = trocear(texto);

  let vectores: number[][];
  try {
    vectores = await embeber(trozos);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error generando los embeddings" },
      { status: 502 },
    );
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    // Confirmar dos veces reemplaza lo anterior en vez de duplicarlo.
    await cliente.query(`DELETE FROM registros WHERE document_id = $1`, [id]);
    await cliente.query(`DELETE FROM documento_chunks WHERE document_id = $1`, [id]);

    const { rows: creado } = await cliente.query(
      `INSERT INTO registros (
         document_id, tipo_documento, resumen, idioma, numero_documento,
         fecha_emision, fecha_vencimiento, moneda, subtotal, impuestos, total,
         metodo_pago, emisor_nombre, emisor_nif, emisor_direccion,
         receptor_nombre, receptor_nif, receptor_direccion
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, confirmado_at`,
      [
        id,
        datos.tipo_documento,
        datos.resumen,
        datos.idioma,
        datos.numero_documento,
        fecha(datos.fecha_emision),
        fecha(datos.fecha_vencimiento),
        datos.moneda,
        datos.subtotal,
        datos.impuestos,
        datos.total,
        datos.metodo_pago,
        datos.emisor.nombre,
        datos.emisor.identificacion_fiscal,
        datos.emisor.direccion,
        datos.receptor.nombre,
        datos.receptor.identificacion_fiscal,
        datos.receptor.direccion,
      ],
    );

    const registroId = creado[0].id as string;

    for (const [orden, linea] of datos.lineas.entries()) {
      await cliente.query(
        `INSERT INTO registro_lineas (registro_id, orden, descripcion, cantidad, precio_unitario, importe)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [registroId, orden, linea.descripcion, linea.cantidad, linea.precio_unitario, linea.importe],
      );
    }

    if (datos.tipo_documento === "contrato" && datos.contrato) {
      await cliente.query(
        `INSERT INTO registro_contratos
           (registro_id, objeto, fecha_inicio, fecha_fin, duracion, importe, ley_aplicable, clausulas_destacadas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          registroId,
          datos.contrato.objeto,
          fecha(datos.contrato.fecha_inicio),
          fecha(datos.contrato.fecha_fin),
          datos.contrato.duracion,
          datos.contrato.importe,
          datos.contrato.ley_aplicable,
          datos.contrato.clausulas_destacadas,
        ],
      );
    }

    for (const [orden, trozo] of trozos.entries()) {
      await cliente.query(
        `INSERT INTO documento_chunks (document_id, orden, texto, embedding)
         VALUES ($1,$2,$3,$4)`,
        [id, orden, trozo, aVector(vectores[orden])],
      );
    }

    await cliente.query("COMMIT");

    return NextResponse.json({
      registro_id: registroId,
      document_id: id,
      confirmado_at: creado[0].confirmado_at,
      lineas: datos.lineas.length,
      chunks: trozos.length,
    });
  } catch (err) {
    await cliente.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo guardar el documento" },
      { status: 500 },
    );
  } finally {
    cliente.release();
  }
}
