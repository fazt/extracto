import { beforeEach, describe, expect, it, vi } from "vitest";
import { facturaValida } from "./factories";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ pool: { query } }));

const { PATCH } = await import("@/app/api/documents/[id]/route");

const ID = "11111111-1111-1111-1111-111111111111";
const params = Promise.resolve({ id: ID });

function peticion(cuerpo: unknown) {
  return new Request(`http://localhost:3000/api/documents/${ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rowCount: 1, rows: [] });
});

describe("PATCH /api/documents/[id]", () => {
  it("guarda las correcciones del formulario", async () => {
    const corregida = { ...facturaValida(), numero_documento: "F-2026/0999" };

    const res = await PATCH(peticion({ extraction: corregida }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.validacion.valido).toBe(true);
    expect(JSON.parse(query.mock.calls[0][1][2]).numero_documento).toBe("F-2026/0999");
  });

  it("guarda también una corrección a medias y devuelve lo que falta", async () => {
    const aMedias = { ...facturaValida(), total: 999, emisor: { nombre: "", identificacion_fiscal: null, direccion: null } };

    const res = await PATCH(peticion({ extraction: aMedias }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.validacion.valido).toBe(false);
    expect(body.validacion.problemas.map((p: { campo: string }) => p.campo).sort()).toEqual([
      "emisor.nombre",
      "total",
    ]);
    expect(query).toHaveBeenCalled();
  });

  it("cambia el tipo de documento si el usuario lo corrige", async () => {
    const comoRecibo = { ...facturaValida(), tipo_documento: "recibo" as const };

    const res = await PATCH(peticion({ extraction: comoRecibo }), { params });

    expect((await res.json()).extraction.tipo_documento).toBe("recibo");
    expect(query.mock.calls[0][1][1]).toBe("recibo");
  });

  it("rechaza un cuerpo que no tiene la forma de una extracción", async () => {
    const res = await PATCH(peticion({ extraction: { tipo_documento: "factura" } }), { params });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/forma esperada/);
    expect(query).not.toHaveBeenCalled();
  });

  it("rechaza un tipo de documento desconocido", async () => {
    const raro = { ...facturaValida(), tipo_documento: "albaran" };

    expect((await PATCH(peticion({ extraction: raro }), { params })).status).toBe(400);
  });

  it("devuelve 404 si el documento ya no existe", async () => {
    query.mockResolvedValue({ rowCount: 0, rows: [] });

    const res = await PATCH(peticion({ extraction: facturaValida() }), { params });

    expect(res.status).toBe(404);
  });
});
