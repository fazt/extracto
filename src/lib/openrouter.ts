export const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

/** El mismo modelo de visión sirve para extraer y para responder preguntas. */
export const MODELO = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4.1-flash";

/** Se lee en cada petición, no al cargar el módulo, para respetar el entorno vivo. */
export function claveOpenRouter(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

/**
 * Enrutado de proveedor. `require_parameters` deja fuera a quien ignoraría el
 * esquema y devolvería una respuesta vacía; el `order` antepone a los que, medidos
 * sobre el mismo documento, responden en segundos y no en decenas de segundos:
 * sin él la misma petición oscilaba entre 1,5 s y 24 s según a quién tocara.
 */
export const PROVEEDORES = {
  order: ["venice", "fireworks", "deepinfra"],
  require_parameters: true,
} as const;

export function cabeceras(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Extracto",
  };
}
