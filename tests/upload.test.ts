import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ pool: { query } }));

const { POST } = await import("@/app/api/upload/route");

function peticion(form: FormData) {
  return new Request("http://localhost:3000/api/upload", { method: "POST", body: form });
}

function archivo(nombre: string, tipo: string, bytes: number) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({
    rows: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        filename: "documento.pdf",
        mime_type: "application/pdf",
        size_bytes: "1024",
        created_at: "2026-03-04T10:00:00.000Z",
      },
    ],
  });
});

describe("POST /api/upload", () => {
  it("guarda un PDF y devuelve su ficha", async () => {
    const form = new FormData();
    form.append("file", archivo("documento.pdf", "application/pdf", 1024));

    const res = await POST(peticion(form));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.filename).toBe("documento.pdf");
    expect(body.mime_type).toBe("application/pdf");

    const [sql, valores] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO documents");
    expect(valores[0]).toBe("documento.pdf");
    expect(valores[1]).toBe("application/pdf");
    expect(valores[2]).toBe(1024);
    expect(Buffer.isBuffer(valores[3])).toBe(true);
  });

  it("acepta también imágenes", async () => {
    const form = new FormData();
    form.append("file", archivo("factura.png", "image/png", 64));

    expect((await POST(peticion(form))).status).toBe(201);
  });

  it("rechaza la petición sin archivo", async () => {
    const res = await POST(peticion(new FormData()));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Falta el archivo/);
    expect(query).not.toHaveBeenCalled();
  });

  it("rechaza un tipo no permitido", async () => {
    const form = new FormData();
    form.append("file", archivo("notas.txt", "text/plain", 10));

    const res = await POST(peticion(form));

    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/text\/plain/);
    expect(query).not.toHaveBeenCalled();
  });

  it("rechaza un archivo sin tipo declarado", async () => {
    const form = new FormData();
    form.append("file", archivo("misterio", "", 10));

    const res = await POST(peticion(form));

    // Sin Content-Type propio el navegador lo manda como octet-stream.
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/application\/octet-stream/);
  });

  it("rechaza un PDF de más de 20 MB", async () => {
    const grande = new File([new Uint8Array(8)], "enorme.pdf", { type: "application/pdf" });
    Object.defineProperty(grande, "size", { value: 21 * 1024 * 1024 });

    const form = new FormData();
    form.append("file", grande);

    // El FormData se pasa directo: al serializarlo en un Request real se
    // perdería el tamaño falseado y habría que mover 20 MB de verdad.
    const res = await POST({ formData: async () => form } as unknown as Request);

    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/20 MB/);
    expect(query).not.toHaveBeenCalled();
  });
});
