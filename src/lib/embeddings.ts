import { EMBEDDINGS_URL, cabeceras, claveOpenRouter } from "@/lib/openrouter";
import type { Extraccion } from "@/lib/schemas";

/** 1536 dimensiones, las que declara la columna `vector(1536)`. */
export const MODELO_EMBEDDINGS =
  process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

export const DIMENSIONES = 1536;

const TAMANO_CHUNK = 800;
const SOLAPE = 120;

/**
 * Trocea el texto en fragmentos con un poco de solape, cortando por el final de
 * línea o de frase más cercano para no partir una cifra o un nombre por la mitad.
 */
export function trocear(texto: string, tamano = TAMANO_CHUNK, solape = SOLAPE): string[] {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  if (limpio === "") return [];
  if (limpio.length <= tamano) return [limpio];

  const trozos: string[] = [];
  let inicio = 0;

  while (inicio < limpio.length) {
    let fin = Math.min(inicio + tamano, limpio.length);

    if (fin < limpio.length) {
      const ventana = limpio.slice(inicio, fin);
      const corte = Math.max(ventana.lastIndexOf("\n"), ventana.lastIndexOf(". "));
      if (corte > tamano * 0.5) fin = inicio + corte + 1;
    }

    const trozo = limpio.slice(inicio, fin).trim();
    if (trozo !== "") trozos.push(trozo);

    if (fin >= limpio.length) break;
    inicio = Math.max(fin - solape, inicio + 1);
  }

  return trozos;
}

/**
 * Texto de respaldo cuando el modelo no transcribe nada (por ejemplo un
 * documento ilegible): se arma con los datos ya estructurados.
 */
export function textoDeRespaldo(datos: Extraccion): string {
  const partes = [
    datos.resumen,
    datos.emisor.nombre && `Emisor: ${datos.emisor.nombre} ${datos.emisor.identificacion_fiscal ?? ""}`,
    datos.receptor.nombre &&
      `Receptor: ${datos.receptor.nombre} ${datos.receptor.identificacion_fiscal ?? ""}`,
    datos.numero_documento && `Número: ${datos.numero_documento}`,
    datos.fecha_emision && `Fecha: ${datos.fecha_emision}`,
    datos.total !== null && `Total: ${datos.total} ${datos.moneda ?? ""}`,
    ...datos.lineas.map((l) => `${l.descripcion} · ${l.cantidad ?? ""} × ${l.precio_unitario ?? ""} = ${l.importe ?? ""}`),
    datos.contrato?.objeto && `Objeto: ${datos.contrato.objeto}`,
    ...(datos.contrato?.clausulas_destacadas ?? []),
  ];

  return partes.filter(Boolean).join("\n");
}

/** Pide los embeddings de varios textos en una sola llamada. */
export async function embeber(textos: string[]): Promise<number[][]> {
  if (textos.length === 0) return [];

  const apiKey = claveOpenRouter();
  if (!apiKey) throw new Error("Falta OPENROUTER_API_KEY en .env.local");

  const res = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: cabeceras(apiKey),
    body: JSON.stringify({ model: MODELO_EMBEDDINGS, input: textos }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `No se pudieron generar los embeddings (${res.status}): ${payload?.error?.message ?? res.statusText}`,
    );
  }

  const datos = payload?.data;
  if (!Array.isArray(datos) || datos.length !== textos.length) {
    throw new Error("El proveedor devolvió menos embeddings de los pedidos");
  }

  // El orden no está garantizado: cada elemento trae su índice.
  const vectores: number[][] = new Array(textos.length);
  for (const item of datos) {
    const vector = item?.embedding;
    if (!Array.isArray(vector) || vector.length !== DIMENSIONES) {
      throw new Error(
        `El modelo ${MODELO_EMBEDDINGS} no devuelve vectores de ${DIMENSIONES} dimensiones`,
      );
    }
    vectores[item.index ?? datos.indexOf(item)] = vector;
  }

  return vectores;
}

/** Formato que espera pgvector para un literal. */
export function aVector(valores: number[]): string {
  return `[${valores.join(",")}]`;
}
