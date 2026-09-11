import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { facturaValida } from "./factories";
import type { Extraccion } from "@/lib/schemas";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ pool: { query } }));

const { POST } = await import("@/app/api/extract/route");

const ID = "11111111-1111-1111-1111-111111111111";

function peticion(id: unknown = ID) {
  return new Request("http://localhost:3000/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/** Documento tal y como sale de la base de datos. */
function enBase(mime = "application/pdf") {
  return {
    rows: [{ filename: "documento.pdf", mime_type: mime, data: Buffer.from("%PDF-1.4") }],
  };
}

/** Respuesta de OpenRouter con el contenido indicado. */
function respuestaModelo(contenido: string) {
  return new Response(
    JSON.stringify({
      model: "deepseek/deepseek-v4.1-flash",
      provider: "Fireworks",
      choices: [{ message: { content: contenido }, finish_reason: "stop" }],
      usage: { total_tokens: 1399 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  query.mockReset();
  query.mockResolvedValueOnce(enBase()).mockResolvedValue({ rowCount: 1, rows: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/extract", () => {
  it("extrae un PDF completo, lo marca válido y lo guarda", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(facturaValida())));

    const res = await POST(peticion());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.doc_type).toBe("factura");
    expect(body.validacion).toEqual({ valido: true, problemas: [] });
    expect(body.extraction.total).toBe(423.5);

    const update = query.mock.calls[1];
    expect(update[0]).toContain("UPDATE documents");
    expect(update[1][1]).toBe("factura");
    expect(JSON.parse(update[1][2]).numero_documento).toBe("F-2026/0418");
  });

  it("no pide la transcripción: el texto llega al archivar", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(facturaValida())));

    const res = await POST(peticion());
    const body = await res.json();

    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    const esquema = enviado.response_format.json_schema.schema;
    expect(Object.keys(esquema.properties)).not.toContain("texto");
    expect(enviado.messages[0].content).not.toMatch(/transcribe/i);
    expect(body.extraction.texto).toBeNull();
  });

  it("manda el PDF como parte file con el plugin de OCR", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(facturaValida())));

    await POST(peticion());

    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    const partes = enviado.messages[1].content;

    expect(partes.some((p: { type: string }) => p.type === "file")).toBe(true);
    expect(enviado.plugins).toEqual([{ id: "file-parser", pdf: { engine: "mistral-ocr" } }]);
    expect(enviado.response_format.json_schema.strict).toBe(true);
  });

  it("manda las imágenes como image_url y sin plugin", async () => {
    query.mockReset();
    query.mockResolvedValueOnce(enBase("image/png")).mockResolvedValue({ rowCount: 1, rows: [] });
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(facturaValida())));

    await POST(peticion());

    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(enviado.messages[1].content[1].type).toBe("image_url");
    expect(enviado.plugins).toBeUndefined();
  });

  it("guarda un PDF incompleto y devuelve los campos que fallan", async () => {
    const incompleta: Extraccion = {
      ...facturaValida(),
      numero_documento: null,
      fecha_emision: "04/03/2026",
      total: 999,
    };
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(incompleta)));

    const res = await POST(peticion());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.validacion.valido).toBe(false);
    expect(body.validacion.problemas.map((p: { campo: string }) => p.campo).sort()).toEqual([
      "fecha_emision",
      "numero_documento",
      "total",
    ]);
    // Aun con problemas se guarda: son correcciones pendientes, no un error.
    expect(query.mock.calls[1][0]).toContain("UPDATE documents");
  });

  it("acepta el JSON envuelto en un bloque de código", async () => {
    const envuelto = "```json\n" + JSON.stringify(facturaValida()) + "\n```";
    fetchMock.mockResolvedValue(respuestaModelo(envuelto));

    expect((await POST(peticion())).status).toBe(200);
  });

  it("devuelve 502 si el modelo no responde con JSON", async () => {
    fetchMock.mockResolvedValue(respuestaModelo("no he podido leer el documento"));

    const res = await POST(peticion());

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/JSON válido/);
  });

  it("devuelve 502 si el JSON no tiene la forma esperada", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify({ tipo_documento: "factura" })));

    const res = await POST(peticion());

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/no cumple el esquema/);
  });

  it("propaga un 401 de OpenRouter", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "User not found" } }), { status: 401 }),
    );

    const res = await POST(peticion());

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/User not found/);
  });

  it("devuelve 404 si el documento no existe", async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 si no se manda id", async () => {
    expect((await POST(peticion(null))).status).toBe(400);
  });

  it("avisa si falta la clave de OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const res = await POST(peticion());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/OPENROUTER_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("robustez frente al proveedor", () => {
  it("sólo acepta proveedores que respeten el esquema", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(JSON.stringify(facturaValida())));

    await POST(peticion());

    const enviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(enviado.provider.require_parameters).toBe(true);
    // El orden antepone a los proveedores rápidos medidos sobre el mismo documento.
    expect(enviado.provider.order[0]).toBe("venice");
    expect(enviado.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("reintenta una vez si la respuesta viene vacía", async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaModelo(""))
      .mockResolvedValueOnce(respuestaModelo(JSON.stringify(facturaValida())));

    const res = await POST(peticion());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("informa del proveedor si tampoco el reintento devuelve nada", async () => {
    fetchMock.mockResolvedValue(respuestaModelo(""));

    const res = await POST(peticion());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/no devolvió contenido/);
  });

  it("avisa si la respuesta se cortó por longitud", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"tipo_documento":' }, finish_reason: "length" }],
        }),
        { status: 200 },
      ),
    );

    const res = await POST(peticion());

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/se cortó por longitud/);
  });
});
