import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const clienteQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query: clienteQuery, release }));

vi.mock("@/lib/db", () => ({ pool: { query, connect } }));

const { documentosCitados, ejecutarConsulta, revisarConsulta } = await import(
  "@/lib/sql-seguro"
);

const DOC = "11111111-1111-1111-1111-111111111111";
const OTRO = "22222222-2222-2222-2222-222222222222";

describe("revisarConsulta", () => {
  it("acepta un SELECT sobre las tablas del dominio", () => {
    const veredicto = revisarConsulta(
      "SELECT sum(total) AS total_facturado, array_agg(document_id) FROM registros WHERE tipo_documento = 'factura'",
    );

    expect(veredicto.ok).toBe(true);
  });

  it("acepta CTEs y JOINs entre las tablas permitidas", () => {
    const sql = `WITH f AS (SELECT id, document_id, total FROM registros WHERE tipo_documento = 'factura')
                 SELECT f.document_id, sum(l.importe) FROM f JOIN registro_lineas l ON l.registro_id = f.id GROUP BY 1`;

    expect(revisarConsulta(sql).ok).toBe(true);
  });

  it("quita el punto y coma final sin quejarse", () => {
    const veredicto = revisarConsulta("SELECT count(*) FROM registros;  ");

    expect(veredicto).toEqual({ ok: true, sql: "SELECT count(*) FROM registros" });
  });

  it.each([
    ["INSERT INTO registros (resumen) VALUES ('x')", /SELECT/],
    ["UPDATE registros SET total = 0", /SELECT/],
    ["DELETE FROM registros", /SELECT/],
    ["DROP TABLE registros", /SELECT/],
    ["TRUNCATE registros", /SELECT/],
  ])("rechaza %s", (sql, mensaje) => {
    const veredicto = revisarConsulta(sql);

    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(mensaje);
  });

  it("rechaza varias sentencias encadenadas", () => {
    const veredicto = revisarConsulta("SELECT 1 FROM registros; DROP TABLE registros");

    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(/una sentencia/);
  });

  it("rechaza una escritura escondida tras un comentario", () => {
    const veredicto = revisarConsulta("SELECT 1 FROM registros -- ; DELETE FROM registros");

    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(/comentarios/);
  });

  it("rechaza tablas que no son del dominio", () => {
    const veredicto = revisarConsulta("SELECT * FROM usuarios");

    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(/usuarios/);
  });

  it("rechaza el catálogo del sistema y las funciones peligrosas", () => {
    expect(revisarConsulta("SELECT * FROM pg_catalog.pg_tables").ok).toBe(false);
    expect(revisarConsulta("SELECT pg_sleep(10) FROM registros").ok).toBe(false);
    expect(revisarConsulta("SELECT pg_read_file('/etc/passwd') FROM registros").ok).toBe(false);
  });

  it("rechaza una consulta vacía", () => {
    expect(revisarConsulta("   ").ok).toBe(false);
  });
});

describe("ejecutarConsulta", () => {
  beforeEach(() => {
    clienteQuery.mockReset();
    release.mockReset();
    connect.mockClear();
    clienteQuery.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT * FROM (")
        ? { rows: [{ total_facturado: "423.50" }], fields: [{ name: "total_facturado" }] }
        : { rows: [], fields: [] },
    );
  });

  it("corre en una transacción de sólo lectura y con tiempo límite", async () => {
    await ejecutarConsulta("SELECT sum(total) AS total_facturado FROM registros");

    const sqls = clienteQuery.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toBe("BEGIN READ ONLY");
    expect(sqls[1]).toContain("statement_timeout");
    expect(sqls.at(-1)).toBe("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });

  it("envuelve la consulta para limitar las filas devueltas", async () => {
    await ejecutarConsulta("SELECT * FROM registros");

    const ejecutada = clienteQuery.mock.calls.map(([sql]) => sql).find((s) => s.includes("LIMIT"));
    expect(ejecutada).toContain("SELECT * FROM (SELECT * FROM registros) AS consulta LIMIT 100");
  });

  it("devuelve columnas y filas", async () => {
    const resultado = await ejecutarConsulta("SELECT sum(total) AS total_facturado FROM registros");

    expect(resultado).toEqual({
      columnas: ["total_facturado"],
      filas: [{ total_facturado: "423.50" }],
    });
  });

  it("suelta la conexión aunque la consulta falle", async () => {
    clienteQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM (")) throw new Error('column "iva" does not exist');
      return { rows: [], fields: [] };
    });

    await expect(ejecutarConsulta("SELECT iva FROM registros")).rejects.toThrow(/does not exist/);
    expect(clienteQuery.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});

describe("documentosCitados", () => {
  it("recoge los uuid sueltos y los de los arrays", () => {
    const ids = documentosCitados([
      { document_id: DOC, total: "423.50" },
      { documentos: [OTRO, DOC], n: 2 },
    ]);

    expect(ids.sort()).toEqual([DOC, OTRO].sort());
  });

  it("ignora lo que no sea un uuid", () => {
    expect(documentosCitados([{ numero: "F-2026/0418", total: 423.5, nada: null }])).toEqual([]);
  });

  it("no repite ids", () => {
    expect(documentosCitados([{ a: DOC }, { b: DOC }])).toEqual([DOC]);
  });
});
