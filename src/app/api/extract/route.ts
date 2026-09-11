import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { ExtraccionBrutaSchema, validarExtraccion } from "@/lib/schemas";
import { CHAT_URL, MODELO, PROVEEDORES, cabeceras, claveOpenRouter } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 120;

// Motor con el que OpenRouter convierte los PDFs antes de pasarlos al modelo.
// mistral-ocr lee también PDFs escaneados; pdf-text sólo extrae texto ya digital.
const PDF_ENGINE = process.env.OPENROUTER_PDF_ENGINE ?? "mistral-ocr";

const SYSTEM = `Eres un extractor de datos de documentos. Recibes la imagen o el PDF de un
documento y devuelves únicamente sus datos estructurados en JSON.

- Clasifica el documento como factura, recibo, contrato u otro.
- Copia los valores tal como aparecen; no inventes datos que no estén en el documento.
- Usa null en cualquier campo que el documento no contenga o que no puedas leer con certeza.
- Los importes van como números, sin símbolo de moneda ni separadores de miles.
- El campo "contrato" sólo se rellena cuando tipo_documento es "contrato"; si no, va null.
- Anota en "notas" cualquier campo ilegible o ambiguo.`;

const jsonSchema = z.toJSONSchema(ExtraccionBrutaSchema.omit({ texto: true }));

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** El modelo puede envolver el JSON en un bloque de código; lo desenvolvemos. */
function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({ id: null }));
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta el id del documento" }, { status: 400 });
  }

  const apiKey = claveOpenRouter();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta OPENROUTER_API_KEY en .env.local" },
      { status: 500 },
    );
  }

  const { rows } = await pool.query(
    `SELECT filename, mime_type, data FROM documents WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const doc = rows[0] as { filename: string; mime_type: string; data: Buffer };
  const dataUrl = `data:${doc.mime_type};base64,${doc.data.toString("base64")}`;
  const isPdf = doc.mime_type === "application/pdf";

  const parts: ContentPart[] = [
    { type: "text", text: `Extrae los datos de este documento (archivo: ${doc.filename}).` },
    isPdf
      ? { type: "file", file: { filename: doc.filename, file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } },
  ];

  const body = {
    model: MODELO,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: parts },
    ],
    max_tokens: 8000,
    // Clasificar y copiar campos no requiere razonar; los tokens de razonamiento
    // sólo alargaban la espera.
    reasoning: { enabled: false },
    // Structured outputs: el proveedor obliga al modelo a respetar el esquema.
    response_format: {
      type: "json_schema",
      json_schema: { name: "extraccion", strict: true, schema: jsonSchema },
    },
    // Sin esto OpenRouter puede enrutar a un proveedor que ignore response_format
    // y devuelva una respuesta vacía, o a uno que tarde veinte segundos de más.
    provider: PROVEEDORES,
    ...(isPdf ? { plugins: [{ id: "file-parser", pdf: { engine: PDF_ENGINE } }] } : {}),
  };

  // Arrow function: así TypeScript conserva que `apiKey` ya no es null.
  const pedir = async () => {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: cabeceras(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(110_000),
    });
    return { res, payload: await res.json().catch(() => null) };
  };

  let { res, payload } = await pedir();

  // Una respuesta vacía suele ser cosa del proveedor que tocó: se reintenta una vez.
  if (res.ok && !payload?.choices?.[0]?.message?.content) {
    ({ res, payload } = await pedir());
  }

  if (!res.ok) {
    const detalle = payload?.error?.message ?? res.statusText;
    return NextResponse.json(
      { error: `OpenRouter respondió ${res.status}: ${detalle}` },
      { status: res.status === 401 ? 401 : 502 },
    );
  }

  const eleccion = payload?.choices?.[0];
  const content: string | undefined = eleccion?.message?.content;
  if (!content) {
    return NextResponse.json(
      {
        error: `El modelo (${payload?.provider ?? "proveedor desconocido"}) no devolvió contenido`,
        finish_reason: eleccion?.finish_reason ?? null,
      },
      { status: 502 },
    );
  }

  if (eleccion.finish_reason === "length") {
    return NextResponse.json(
      { error: "La respuesta del modelo se cortó por longitud; reintenta el análisis" },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJsonLoose(content);
  } catch {
    return NextResponse.json(
      { error: "El modelo no devolvió un JSON válido", crudo: content.slice(0, 2000) },
      { status: 502 },
    );
  }

  const validado = ExtraccionBrutaSchema.safeParse({
    ...(parsed as object),
    // La transcripción llega al archivar, no aquí.
    texto: null,
  });
  if (!validado.success) {
    return NextResponse.json(
      {
        error: "El JSON del modelo no cumple el esquema",
        problemas: validado.error.issues.slice(0, 10),
        crudo: parsed,
      },
      { status: 502 },
    );
  }

  const extraccion = validado.data;
  // Las reglas por tipo (fechas, obligatorios, cuadre) no bloquean el guardado:
  // se devuelven para que el formulario las marque en rojo y se puedan corregir.
  const validacion = validarExtraccion(extraccion);

  await pool.query(
    `UPDATE documents
        SET doc_type = $2, extraction = $3, extracted_at = now()
      WHERE id = $1`,
    [id, extraccion.tipo_documento, JSON.stringify(extraccion)],
  );

  return NextResponse.json({
    id,
    modelo: payload?.model ?? MODELO,
    doc_type: extraccion.tipo_documento,
    extraction: extraccion,
    validacion,
    usage: payload?.usage ?? null,
  });
}
