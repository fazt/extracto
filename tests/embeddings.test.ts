import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIMENSIONES, aVector, embeber, textoDeRespaldo, trocear } from "@/lib/embeddings";
import { base, facturaValida } from "./factories";

describe("trocear", () => {
  it("deja el texto corto en un solo fragmento", () => {
    expect(trocear("Factura de 423,50 €")).toEqual(["Factura de 423,50 €"]);
  });

  it("devuelve una lista vacía si no hay texto", () => {
    expect(trocear("")).toEqual([]);
    expect(trocear("   \n  ")).toEqual([]);
  });

  it("parte los textos largos y cubre todo el contenido", () => {
    const texto = Array.from({ length: 60 }, (_, i) => `Línea ${i} con contenido.`).join("\n");
    const trozos = trocear(texto, 200, 40);

    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos[0]).toContain("Línea 0");
    expect(trozos.at(-1)).toContain("Línea 59");
    for (const t of trozos) expect(t.length).toBeLessThanOrEqual(200);
  });

  it("corta por final de línea cuando puede", () => {
    const texto = `${"a".repeat(150)}\n${"b".repeat(150)}`;
    const [primero] = trocear(texto, 200, 20);

    expect(primero.endsWith("a")).toBe(true);
  });

  it("termina aunque el solape sea mayor que el fragmento", () => {
    const trozos = trocear("x".repeat(1000), 100, 500);

    expect(trozos.length).toBeGreaterThan(0);
    expect(trozos.length).toBeLessThan(1000);
  });
});

describe("textoDeRespaldo", () => {
  it("arma un texto con los datos cuando no hay transcripción", () => {
    const texto = textoDeRespaldo(facturaValida());

    expect(texto).toContain("Tostadores del Sur S.L.");
    expect(texto).toContain("F-2026/0418");
    expect(texto).toContain("423.5");
    expect(texto).toContain("Café en grano 1 kg");
  });

  it("omite lo que no existe, sin dejar líneas sueltas", () => {
    const texto = textoDeRespaldo(base());

    expect(texto).toBe("Documento de prueba");
  });
});

describe("aVector", () => {
  it("usa el literal que entiende pgvector", () => {
    expect(aVector([1, -0.5, 0])).toBe("[1,-0.5,0]");
  });
});

describe("embeber", () => {
  const fetchMock = vi.fn();

  function respuesta(vectores: number[][]) {
    return new Response(
      JSON.stringify({
        data: vectores.map((embedding, index) => ({ embedding, index })),
      }),
      { status: 200 },
    );
  }

  const vector = () => Array.from({ length: DIMENSIONES }, () => 0.01);

  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("pide todos los fragmentos en una sola llamada", async () => {
    fetchMock.mockResolvedValue(respuesta([vector(), vector()]));

    const vectores = await embeber(["uno", "dos"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input).toEqual(["uno", "dos"]);
    expect(vectores).toHaveLength(2);
    expect(vectores[0]).toHaveLength(DIMENSIONES);
  });

  it("no llama al proveedor si no hay nada que embeber", async () => {
    expect(await embeber([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respeta el índice que devuelve el proveedor", async () => {
    const primero = vector();
    const segundo = vector().map(() => 0.99);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { embedding: segundo, index: 1 },
            { embedding: primero, index: 0 },
          ],
        }),
        { status: 200 },
      ),
    );

    const [a, b] = await embeber(["uno", "dos"]);

    expect(a[0]).toBe(0.01);
    expect(b[0]).toBe(0.99);
  });

  it("avisa si el modelo no devuelve las dimensiones de la columna", async () => {
    fetchMock.mockResolvedValue(respuesta([[0.1, 0.2, 0.3]]));

    await expect(embeber(["uno"])).rejects.toThrow(/dimensiones/);
  });

  it("avisa si faltan embeddings", async () => {
    fetchMock.mockResolvedValue(respuesta([vector()]));

    await expect(embeber(["uno", "dos"])).rejects.toThrow(/menos embeddings/);
  });

  it("propaga el error del proveedor", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "sin saldo" } }), { status: 402 }),
    );

    await expect(embeber(["uno"])).rejects.toThrow(/402.*sin saldo/);
  });

  it("avisa si falta la clave", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(embeber(["uno"])).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
