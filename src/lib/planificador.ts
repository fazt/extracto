import { z } from "zod";
import { ESQUEMA, REGLAS_SQL } from "@/lib/esquema-sql";
import { CHAT_URL, MODELO, cabeceras, claveOpenRouter } from "@/lib/openrouter";

export const PlanSchema = z.object({
  modo: z
    .enum(["sql", "semantica"])
    .describe(
      "sql para cálculos, totales, conteos, promedios, comparaciones o filtros por fecha e importe; semantica para preguntas sobre el contenido o la redacción de un documento",
    ),
  sql: z
    .string()
    .nullable()
    .describe("La consulta SELECT cuando modo es sql; null cuando es semantica"),
  motivo: z.string().describe("Una frase explicando la elección"),
});

export type Plan = z.infer<typeof PlanSchema>;

const PROMPT = `Decides cómo responder una pregunta sobre documentos ya archivados
(facturas, recibos y contratos).

Elige "sql" cuando la pregunta pide una cuenta: sumas, totales, medias, máximos,
conteos, "cuánto", "cuántos", comparaciones entre documentos, o filtros por fecha,
importe, emisor o tipo. Es el modo preferido siempre que la respuesta salga de los
campos estructurados.

Elige "semantica" cuando la pregunta va del contenido redactado de un documento
(cláusulas, condiciones, descripciones, "qué dice sobre...") y no de sus cifras.

Esquema disponible:
${ESQUEMA}

${REGLAS_SQL}`;

const jsonSchema = z.toJSONSchema(PlanSchema);

/** Decide el modo y, si toca, escribe la consulta. Una sola llamada al modelo. */
export async function planificar(pregunta: string): Promise<Plan> {
  const apiKey = claveOpenRouter();
  if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY en .env.local");

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: cabeceras(apiKey),
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1000,
      reasoning: { enabled: false },
      response_format: {
        type: "json_schema",
        json_schema: { name: "plan", strict: true, schema: jsonSchema },
      },
      provider: { require_parameters: true },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: pregunta },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `OpenRouter respondió ${res.status}: ${payload?.error?.message ?? res.statusText}`,
    );
  }

  const contenido = payload?.choices?.[0]?.message?.content;
  if (typeof contenido !== "string" || contenido.trim() === "") {
    // Sin plan utilizable se sigue por el camino de siempre.
    return { modo: "semantica", sql: null, motivo: "El planificador no respondió" };
  }

  const parsed = PlanSchema.safeParse(JSON.parse(contenido));
  if (!parsed.success) {
    return { modo: "semantica", sql: null, motivo: "Plan con formato inesperado" };
  }

  // Un plan "sql" sin consulta no sirve de nada.
  if (parsed.data.modo === "sql" && !parsed.data.sql?.trim()) {
    return { ...parsed.data, modo: "semantica", sql: null };
  }

  return parsed.data;
}
