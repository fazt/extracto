import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ pool: { query } }));

const { GET } = await import("@/app/api/registros/route");

const fila = {
  id: "22222222-2222-2222-2222-222222222222",
  document_id: "11111111-1111-1111-1111-111111111111",
  filename: "factura.png",
  tipo_documento: "factura",
  numero_documento: "F-2026/0418",
  fecha_emision: "2026-03-04",
  emisor_nombre: "Tostadores del Sur S.L.",
  receptor_nombre: "Cafeteria La Esquina S.L.",
  total: "423.50",
  moneda: "EUR",
  confirmado_at: "2026-03-04T10:00:00.000Z",
  lineas: 4,
  chunks: 3,
};

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [fila] });
});

describe("GET /api/registros", () => {
  it("devuelve los documentos confirmados con sus contadores", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ numero_documento: "F-2026/0418", lineas: 4, chunks: 3 });
  });

  it("los ordena por fecha de confirmacion descendente", async () => {
    await GET();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("ORDER BY r.confirmado_at DESC");
    expect(sql).toContain("JOIN documents");
  });

  it("devuelve una lista vacia si todavia no hay nada confirmado", async () => {
    query.mockResolvedValue({ rows: [] });

    expect(await (await GET()).json()).toEqual([]);
  });
});
