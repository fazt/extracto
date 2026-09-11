import { NextResponse } from "next/server";
import { buscarFragmentos, construirContexto, fuentesPorDocumento } from "@/lib/busqueda";
import { embeber } from "@/lib/embeddings";
import { CHAT_URL, MODELO, cabeceras, claveOpenRouter } from "@/lib/openrouter";
import { planificar } from "@/lib/planificador";
import { documentosCitados, ejecutarConsulta, revisarConsulta } from "@/lib/sql-seguro";

export const runtime = "nodejs";
export const maxDuration = 120;

const SIN_RESULTADOS =
  "No encuentro nada sobre eso en los documentos guardados. Prueba a preguntar de otra forma, o confirma primero el documento donde debería estar.";

const COMUNES = `- Responde sólo con los datos que te paso. Si no están, dilo claramente.
- Cita la fuente de cada dato con su número entre corchetes, así: [1].
- Sé breve y concreto: cifras, fechas y nombres tal y como figuran.`;

const SYSTEM_SEMANTICA = `Respondes preguntas sobre los documentos guardados del usuario
(facturas, recibos y contratos). Te paso fragmentos numerados de esos documentos.

${COMUNES}
- No inventes importes ni fechas que no puedas citar.`;

const SYSTEM_SQL = `Respondes preguntas de cálculo sobre los documentos guardados del
usuario. Te paso la consulta SQL que se ha ejecutado, su resultado y los documentos
implicados, numerados.

${COMUNES}
- El resultado del SQL es la verdad: no lo recalcules ni lo corrijas.
- Si el resultado viene vacío, di que no hay documentos que cumplan la condición.
- No menciones el SQL salvo que te lo pregunten.`;

type Turno = { role: "user" | "assistant"; content: string };

/** Sólo se reenvían los últimos turnos, para no inflar el contexto. */
function historialReciente(historial: unknown): Turno[] {
  if (!Array.isArray(historial)) return [];

  return historial
    .filter(
      (t): t is Turno =>
        typeof t?.content === "string" &&
        t.content.trim() !== "" &&
        (t.role === "user" || t.role === "assistant"),
    )
    .slice(-6);
}

type Redaccion =
  | { ok: true; texto: string }
  | { ok: false; mensaje: string; estado: number };

async function redactar(
  system: string,
  historial: Turno[],
  contenido: string,
): Promise<Redaccion> {
  const apiKey = claveOpenRouter()!;

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: cabeceras(apiKey),
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 2000,
      // El modelo gastaba en razonar buena parte del presupuesto de tokens y la
      // respuesta se cortaba a mitad de frase; para citar datos no hace falta.
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: system },
        ...historial,
        { role: "user", content: contenido },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      mensaje: `OpenRouter respondió ${res.status}: ${payload?.error?.message ?? res.statusText}`,
      estado: res.status === 401 ? 401 : 502,
    };
  }

  const eleccion = payload?.choices?.[0];
  const texto: string | undefined = eleccion?.message?.content;
  if (!texto?.trim()) {
    return { ok: false, mensaje: "El modelo no devolvió respuesta", estado: 502 };
  }

  return {
    ok: true,
    texto:
      eleccion.finish_reason === "length"
        ? `${texto}…\n\n(La respuesta se cortó por longitud.)`
        : texto,
  } as const;
}

/** Deja sólo las fuentes que la respuesta llega a citar; el resto sería ruido. */
function soloCitadas<T extends { n: number }>(respuesta: string, fuentes: T[]): T[] {
  const citadas = new Set([...respuesta.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return fuentes.filter((f) => citadas.size === 0 || citadas.has(f.n));
}

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const pregunta = typeof cuerpo?.pregunta === "string" ? cuerpo.pregunta.trim() : "";

  if (pregunta === "") {
    return NextResponse.json({ error: "Escribe una pregunta" }, { status: 400 });
  }

  if (!claveOpenRouter()) {
    return NextResponse.json(
      { error: "Falta OPENROUTER_API_KEY en .env.local" },
      { status: 500 },
    );
  }

  const historial = historialReciente(cuerpo?.historial);

  // Las preguntas de cálculo se responden con SQL sobre las tablas; el resto,
  // buscando por significado en los embeddings.
  const plan = await planificar(pregunta).catch(() => null);

  if (plan?.modo === "sql" && plan.sql) {
    const respuesta = await responderConSql(plan.sql, pregunta, historial);
    if (respuesta) return respuesta;
    // Si el SQL no cuela (consulta rechazada o error de Postgres) se sigue por
    // la búsqueda semántica en vez de dejar al usuario sin respuesta.
  }

  return responderConEmbeddings(pregunta, historial);
}

async function responderConSql(sqlPropuesto: string, pregunta: string, historial: Turno[]) {
  const veredicto = revisarConsulta(sqlPropuesto);
  if (!veredicto.ok) return null;

  let resultado;
  try {
    resultado = await ejecutarConsulta(veredicto.sql);
  } catch {
    return null;
  }

  const fuentes = await fuentesPorDocumento(documentosCitados(resultado.filas));

  const contexto = [
    `Pregunta: ${pregunta}`,
    "",
    "Consulta ejecutada:",
    veredicto.sql,
    "",
    `Resultado (${resultado.filas.length} ${resultado.filas.length === 1 ? "fila" : "filas"}):`,
    JSON.stringify(resultado.filas.slice(0, 20), null, 1),
    "",
    fuentes.length > 0
      ? `Documentos implicados:\n${fuentes
          .map(
            (f) =>
              `[${f.n}] ${f.tipo_documento}${
                f.numero_documento ? ` nº ${f.numero_documento}` : ""
              }${f.fecha_emision ? ` · ${f.fecha_emision}` : ""}${
                f.emisor_nombre ? ` · ${f.emisor_nombre}` : ""
              } · ${f.filename} (document_id ${f.document_id})`,
          )
          .join("\n")}`
      : "No hay documentos que citar.",
  ].join("\n");

  const redaccion = await redactar(SYSTEM_SQL, historial, contexto);
  if (!redaccion.ok) {
    return NextResponse.json({ error: redaccion.mensaje }, { status: redaccion.estado });
  }

  return NextResponse.json({
    respuesta: redaccion.texto,
    fuentes: soloCitadas(redaccion.texto, fuentes),
    modo: "sql",
    sql: veredicto.sql,
    filas: resultado.filas.slice(0, 20),
  });
}

async function responderConEmbeddings(pregunta: string, historial: Turno[]) {
  let fragmentos;
  try {
    const [embedding] = await embeber([pregunta]);
    fragmentos = await buscarFragmentos(embedding);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error buscando en los documentos" },
      { status: 502 },
    );
  }

  // Sin fragmentos relevantes no se llama al modelo: no tendría de dónde citar.
  if (fragmentos.length === 0) {
    return NextResponse.json({ respuesta: SIN_RESULTADOS, fuentes: [], modo: "semantica" });
  }

  const redaccion = await redactar(
    SYSTEM_SEMANTICA,
    historial,
    `Fragmentos de los documentos guardados:\n\n${construirContexto(
      fragmentos,
    )}\n\nPregunta: ${pregunta}`,
  );
  if (!redaccion.ok) {
    return NextResponse.json({ error: redaccion.mensaje }, { status: redaccion.estado });
  }

  const fuentes = soloCitadas(redaccion.texto, fragmentos).map((f) => ({
    n: f.n,
    document_id: f.document_id,
    filename: f.filename,
    tipo_documento: f.tipo_documento,
    numero_documento: f.numero_documento,
    fecha_emision: f.fecha_emision,
    emisor_nombre: f.emisor_nombre,
    similitud: Number(f.similitud.toFixed(3)),
    fragmento: f.texto.slice(0, 300),
  }));

  return NextResponse.json({ respuesta: redaccion.texto, fuentes, modo: "semantica" });
}
