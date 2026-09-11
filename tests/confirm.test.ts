import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contratoValido, facturaValida } from "./factories";
import { DIMENSIONES } from "@/lib/embeddings";
import type { Extraccion } from "@/lib/schemas";

const query = vi.fn();
const clienteQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query: clienteQuery, release }));

vi.mock("@/lib/db", () => ({ pool: { query, connect } }));

const { POST } = await import("@/app/api/confirm/route");

const ID = "11111111-1111-1111-1111-111111111111";
const REGISTRO = "22222222-2222-2222-2222-222222222222";

function peticion(id: unknown = ID) {
  return new Request("http://localhost:3000/api/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

const fetchMock = vi.fn();
const vector = () => Array.from({ length: DIMENSIONES }, () => 0.01);

/**
 * Embeddings para lo que pida la ruta y, cuando toque, una transcripción:
 * al archivar sin texto guardado, la ruta pide primero la transcripción.
 */
function embeddingsSegunPeticion(transcripcion: string | null = "TEXTO TRANSCRITO DEL DOCUMENTO") {
  fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
    if (url.includes("/chat/completions")) {
      if (transcripcion === null) return new Response("boom", { status: 500 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: transcripcion } }] }),
        { status: 200 },
      );
    }
    const { input } = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        data: (input as string[]).map((_, index) => ({ embedding: vector(), index })),
      }),
      { status: 200 },
    );
  });
}

/** Cuerpo de la llamada de transcripción, si la hubo. */
function peticionDeTranscripcion() {
  const llamada = fetchMock.mock.calls.find(([url]) => url.includes("/chat/completions"));
  return llamada ? JSON.parse(llamada[1].body) : null;
}

/** Filtra las llamadas hechas dentro de la transacción por tabla. */
function inserts(tabla: string) {
  return clienteQuery.mock.calls.filter(([sql]) => sql.includes(`INSERT INTO ${tabla}`));
}

function conExtraccion(datos: Extraccion) {
  query.mockResolvedValue({
    rows: [
      {
        extraction: datos,
        filename: "factura.png",
        mime_type: "image/png",
        data: Buffer.from("imagen"),
      },
    ],
  });
}

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  query.mockReset();
  clienteQuery.mockReset();
  release.mockReset();
  connect.mockClear();

  embeddingsSegunPeticion();
  conExtraccion(facturaValida());
  clienteQuery.mockImplementation(async (sql: string) =>
    sql.includes("INSERT INTO registros")
      ? { rows: [{ id: REGISTRO, confirmado_at: "2026-03-04T10:00:00.000Z" }] }
      : { rows: [], rowCount: 1 },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/confirm", () => {
  it("guarda cabecera, líneas y chunks dentro de una transacción", async () => {
    const res = await POST(peticion());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.registro_id).toBe(REGISTRO);
    expect(body.lineas).toBe(2);
    expect(body.chunks).toBeGreaterThan(0);

    const sqls = clienteQuery.mock.calls.map(([sql]) => sql.trim().split("\n")[0]);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");

    expect(inserts("registros")).toHaveLength(1);
    expect(inserts("registro_lineas")).toHaveLength(2);
    expect(inserts("documento_chunks")).toHaveLength(body.chunks);
    expect(release).toHaveBeenCalled();
  });

  it("guarda los campos de la cabecera en sus columnas", async () => {
    await POST(peticion());

    const [, valores] = inserts("registros")[0];
    expect(valores).toEqual(
      expect.arrayContaining([
        ID,
        "factura",
        "F-2026/0418",
        "2026-03-04",
        "EUR",
        423.5,
        "Tostadores del Sur S.L.",
        "B-87654321",
        "Cafetería La Esquina S.L.",
      ]),
    );
  });

  it("guarda el embedding como literal de pgvector", async () => {
    await POST(peticion());

    const [, valores] = inserts("documento_chunks")[0];
    expect(valores[0]).toBe(ID);
    expect(typeof valores[3]).toBe("string");
    expect(valores[3]).toMatch(/^\[0\.01,/);
  });

  it("borra lo anterior para que confirmar dos veces no duplique", async () => {
    await POST(peticion());

    const borrados = clienteQuery.mock.calls.filter(([sql]) => sql.startsWith("DELETE"));
    expect(borrados).toHaveLength(2);
    expect(borrados.map(([sql]) => sql)).toEqual([
      expect.stringContaining("FROM registros"),
      expect.stringContaining("FROM documento_chunks"),
    ]);
  });

  it("guarda el detalle propio de un contrato", async () => {
    conExtraccion(contratoValido());

    const res = await POST(peticion());

    expect(res.status).toBe(200);
    expect(inserts("registro_contratos")).toHaveLength(1);
    const [, valores] = inserts("registro_contratos")[0];
    expect(valores).toEqual(
      expect.arrayContaining([
        "Arrendamiento del local de Calle Sorní 12",
        "2026-02-01",
        "2029-01-31",
        ["Fianza de 2.500 euros"],
      ]),
    );
  });

  it("no crea fila de contrato para una factura", async () => {
    await POST(peticion());

    expect(inserts("registro_contratos")).toHaveLength(0);
  });

  it("usa la transcripción del documento para los embeddings", async () => {
    conExtraccion({ ...facturaValida(), texto: "TOSTADORES DEL SUR\nFACTURA F-2026/0418" });

    await POST(peticion());

    const { input } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(input[0]).toContain("TOSTADORES DEL SUR");
  });

  it("transcribe el documento al archivar cuando el borrador no trae texto", async () => {
    conExtraccion({ ...facturaValida(), texto: null });

    const res = await POST(peticion());

    expect(res.status).toBe(200);
    expect(peticionDeTranscripcion()).not.toBeNull();

    const embeddings = fetchMock.mock.calls.find(([url]) => url.includes("/embeddings"));
    const { input } = JSON.parse(embeddings![1].body);
    expect(input[0]).toContain("TEXTO TRANSCRITO");

    // El texto conseguido se guarda: reconfirmar no vuelve a transcribir.
    const guardado = clienteQuery.mock.calls.find(([sql]) => sql.includes("jsonb_set"));
    expect(guardado).toBeDefined();
  });

  it("no vuelve a transcribir si el borrador ya trae texto", async () => {
    conExtraccion({ ...facturaValida(), texto: "YA TRANSCRITO ANTES" });

    await POST(peticion());

    expect(peticionDeTranscripcion()).toBeNull();
    const embeddings = fetchMock.mock.calls.find(([url]) => url.includes("/embeddings"));
    expect(JSON.parse(embeddings![1].body).input[0]).toContain("YA TRANSCRITO ANTES");
  });

  it("archiva igual si la transcripción falla, con el texto derivado de los datos", async () => {
    embeddingsSegunPeticion(null);
    conExtraccion({ ...facturaValida(), texto: null });

    const res = await POST(peticion());

    expect(res.status).toBe(200);
    const embeddings = fetchMock.mock.calls.find(([url]) => url.includes("/embeddings"));
    expect(JSON.parse(embeddings![1].body).input[0]).toContain("Tostadores del Sur S.L.");
  });

  it("rechaza confirmar un documento con campos inválidos", async () => {
    conExtraccion({ ...facturaValida(), total: 999 });

    const res = await POST(peticion());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.validacion.problemas[0].campo).toBe("total");
    expect(connect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no abre la transacción si fallan los embeddings", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "sin saldo" } }), { status: 402 }),
    );

    const res = await POST(peticion());

    expect(res.status).toBe(502);
    expect(connect).not.toHaveBeenCalled();
  });

  it("hace ROLLBACK si falla una inserción", async () => {
    clienteQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO registro_lineas")) throw new Error("columna inexistente");
      if (sql.includes("INSERT INTO registros")) {
        return { rows: [{ id: REGISTRO, confirmado_at: "2026-03-04T10:00:00.000Z" }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const res = await POST(peticion());

    expect(res.status).toBe(500);
    expect(clienteQuery.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });

  it("devuelve 409 si el documento aún no se ha analizado", async () => {
    query.mockResolvedValue({ rows: [{ extraction: null }] });

    expect((await POST(peticion())).status).toBe(409);
  });

  it("devuelve 404 si el documento no existe", async () => {
    query.mockResolvedValue({ rows: [] });

    expect((await POST(peticion())).status).toBe(404);
  });

  it("devuelve 400 sin id", async () => {
    expect((await POST(peticion(null))).status).toBe(400);
  });
});
