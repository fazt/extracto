import { CHAT_URL, MODELO, cabeceras, claveOpenRouter, PROVEEDORES } from "@/lib/openrouter";

const PDF_ENGINE = process.env.OPENROUTER_PDF_ENGINE ?? "mistral-ocr";

const SYSTEM = `Transcribes documentos. Devuelves únicamente el texto visible del
documento, literal y en orden de lectura, sin resumirlo, sin reordenarlo y sin añadir
comentarios ni formato de tu cosecha.`;

/**
 * Transcribe el documento completo.
 *
 * Vive aparte de la extracción a propósito: la transcripción son entre mil y dos mil
 * tokens de salida, y pedirla junto con los campos duplicaba la espera de la pantalla
 * de revisión (22,9 s frente a 10,2 s medidos sobre la misma factura). Aquí se pide
 * al archivar, que es cuando el texto hace falta de verdad para los embeddings.
 */
export async function transcribir(doc: {
  filename: string;
  mime_type: string;
  data: Buffer;
}): Promise<string | null> {
  const apiKey = claveOpenRouter();
  if (!apiKey) return null;

  const dataUrl = `data:${doc.mime_type};base64,${doc.data.toString("base64")}`;
  const esPdf = doc.mime_type === "application/pdf";

  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: cabeceras(apiKey),
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        // Transcribir no requiere razonar: los tokens de razonamiento sólo alargan.
        reasoning: { enabled: false },
        provider: PROVEEDORES,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe este documento." },
              esPdf
                ? { type: "file", file: { filename: doc.filename, file_data: dataUrl } }
                : { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        ...(esPdf ? { plugins: [{ id: "file-parser", pdf: { engine: PDF_ENGINE } }] } : {}),
      }),
      signal: AbortSignal.timeout(110_000),
    });

    if (!res.ok) return null;

    const payload = await res.json().catch(() => null);
    const texto: string | undefined = payload?.choices?.[0]?.message?.content;
    return texto?.trim() ? texto : null;
  } catch {
    // Si la transcripción falla, el archivado sigue: se indexa el texto derivado
    // de los campos ya revisados en vez de quedarse sin nada.
    return null;
  }
}
