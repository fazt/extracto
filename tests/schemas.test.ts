import { describe, expect, it } from "vitest";
import { esFechaISO, porCampo, validarExtraccion, type Extraccion } from "@/lib/schemas";
import { escribir, leer } from "@/lib/schemas/campos";
import { aNumero } from "@/lib/numero";
import {
  base,
  campos,
  contratoValido,
  facturaValida,
  reciboValido,
} from "./factories";

describe("fechas", () => {
  it("acepta fechas reales en formato AAAA-MM-DD", () => {
    expect(esFechaISO("2026-03-04")).toBe(true);
    expect(esFechaISO("2024-02-29")).toBe(true); // bisiesto
  });

  it("rechaza formatos que no son AAAA-MM-DD", () => {
    for (const malo of ["04/03/2026", "2026-3-4", "marzo 2026", "", "2026-03-04T00:00:00Z"]) {
      expect(esFechaISO(malo)).toBe(false);
    }
  });

  it("rechaza fechas que no existen en el calendario", () => {
    expect(esFechaISO("2026-02-31")).toBe(false);
    expect(esFechaISO("2026-13-01")).toBe(false);
    expect(esFechaISO("2025-02-29")).toBe(false); // no bisiesto
  });

  it("marca en rojo el campo de fecha mal escrito", () => {
    const factura = { ...facturaValida(), fecha_emision: "04/03/2026" };
    const { valido, problemas } = validarExtraccion(factura);

    expect(valido).toBe(false);
    expect(campos(problemas)).toContain("fecha_emision");
    expect(porCampo(problemas)["fecha_emision"][0]).toMatch(/AAAA-MM-DD/);
  });

  it("rechaza un vencimiento anterior a la emisión", () => {
    const factura = { ...facturaValida(), fecha_vencimiento: "2026-02-01" };
    const { problemas } = validarExtraccion(factura);

    expect(campos(problemas)).toEqual(["fecha_vencimiento"]);
  });
});

describe("factura", () => {
  it("da por válida una factura completa y cuadrada", () => {
    expect(validarExtraccion(facturaValida())).toEqual({ valido: true, problemas: [] });
  });

  it("exige los campos obligatorios y los señala uno a uno", () => {
    const incompleta = {
      ...facturaValida(),
      numero_documento: null,
      fecha_emision: null,
      moneda: null,
      total: null,
      emisor: { nombre: null, identificacion_fiscal: null, direccion: null },
    };
    const { valido, problemas } = validarExtraccion(incompleta);

    expect(valido).toBe(false);
    expect(campos(problemas)).toEqual([
      "emisor.nombre",
      "fecha_emision",
      "moneda",
      "numero_documento",
      "total",
    ]);
  });

  it("no acepta una factura sin líneas", () => {
    const { problemas } = validarExtraccion({ ...facturaValida(), lineas: [] });

    expect(porCampo(problemas)["lineas"][0]).toMatch(/al menos una línea/);
  });

  it("exige descripción en cada línea, con el índice del campo", () => {
    const factura = facturaValida();
    factura.lineas[1] = { ...factura.lineas[1], descripcion: "" };
    const { problemas } = validarExtraccion(factura);

    expect(campos(problemas)).toEqual(["lineas.1.descripcion"]);
  });

  it("exige el código ISO de moneda", () => {
    const { problemas } = validarExtraccion({ ...facturaValida(), moneda: "euros" });

    expect(porCampo(problemas)["moneda"][0]).toMatch(/ISO/);
  });
});

describe("cuadre subtotal + impuestos = total", () => {
  it("acepta la suma exacta", () => {
    expect(validarExtraccion(facturaValida()).valido).toBe(true);
  });

  it("acepta una desviación de céntimos por redondeo", () => {
    const factura = { ...facturaValida(), total: 423.52 };

    expect(validarExtraccion(factura).valido).toBe(true);
  });

  it("rechaza un total que no cuadra y explica la cuenta", () => {
    const factura = { ...facturaValida(), total: 500 };
    const { valido, problemas } = validarExtraccion(factura);

    expect(valido).toBe(false);
    expect(campos(problemas)).toEqual(["total"]);
    expect(porCampo(problemas)["total"][0]).toContain("423.5");
  });

  it("no comprueba el cuadre si falta alguno de los tres importes", () => {
    const recibo = { ...reciboValido(), subtotal: null, impuestos: null };

    expect(validarExtraccion(recibo).valido).toBe(true);
  });

  it("también cuadra los recibos", () => {
    const recibo = { ...reciboValido(), impuestos: 5 };

    expect(campos(validarExtraccion(recibo).problemas)).toEqual(["total"]);
  });
});

describe("recibo", () => {
  it("es válido sin receptor ni número", () => {
    expect(validarExtraccion(reciboValido()).valido).toBe(true);
  });

  it("exige emisor, fecha, moneda y total", () => {
    const incompleto = {
      ...reciboValido(),
      emisor: { nombre: null, identificacion_fiscal: null, direccion: null },
      fecha_emision: null,
      moneda: null,
      total: null,
      subtotal: null,
      impuestos: null,
    };

    expect(campos(validarExtraccion(incompleto).problemas)).toEqual([
      "emisor.nombre",
      "fecha_emision",
      "moneda",
      "total",
    ]);
  });
});

describe("contrato", () => {
  it("da por válido un contrato con partes, objeto y vigencia", () => {
    expect(validarExtraccion(contratoValido()).valido).toBe(true);
  });

  it("exige el nombre de las dos partes, el objeto y el inicio de vigencia", () => {
    const contrato = contratoValido();
    const incompleto = {
      ...contrato,
      receptor: { nombre: null, identificacion_fiscal: null, direccion: null },
      contrato: { ...contrato.contrato!, objeto: null, fecha_inicio: null },
    };

    expect(campos(validarExtraccion(incompleto).problemas)).toEqual([
      "contrato.fecha_inicio",
      "contrato.objeto",
      "receptor.nombre",
    ]);
  });

  it("rechaza un fin de vigencia anterior al inicio", () => {
    const contrato = contratoValido();
    const invertido = {
      ...contrato,
      contrato: { ...contrato.contrato!, fecha_fin: "2025-01-01" },
    };

    expect(campos(validarExtraccion(invertido).problemas)).toEqual(["contrato.fecha_fin"]);
  });

  it("no le aplica el cuadre de importes", () => {
    const contrato = contratoValido();
    const conImportes = { ...contrato, subtotal: 100, impuestos: 21, total: 999 };

    expect(validarExtraccion(conImportes).valido).toBe(true);
  });

  it("no es válido sin el bloque de contrato", () => {
    const sinBloque = { ...contratoValido(), contrato: null };

    expect(validarExtraccion(sinBloque).valido).toBe(false);
  });
});

describe("otro", () => {
  it("sólo exige un resumen", () => {
    expect(validarExtraccion(base()).valido).toBe(true);
    expect(campos(validarExtraccion({ ...base(), resumen: "" }).problemas)).toEqual(["resumen"]);
  });
});

describe("porCampo", () => {
  it("agrupa varios mensajes del mismo campo", () => {
    const mapa = porCampo([
      { campo: "total", mensaje: "uno" },
      { campo: "total", mensaje: "dos" },
      { campo: "moneda", mensaje: "tres" },
    ]);

    expect(mapa).toEqual({ total: ["uno", "dos"], moneda: ["tres"] });
  });
});

describe("leer / escribir", () => {
  it("lee rutas anidadas", () => {
    expect(leer(facturaValida(), "emisor.nombre")).toBe("Tostadores del Sur S.L.");
    expect(leer(facturaValida(), "contrato.objeto")).toBeUndefined();
  });

  it("escribe sin mutar el original", () => {
    const original = facturaValida();
    const copia = escribir(original, "emisor.nombre", "Otro S.L.");

    expect(copia.emisor.nombre).toBe("Otro S.L.");
    expect(original.emisor.nombre).toBe("Tostadores del Sur S.L.");
    expect(copia.receptor).toEqual(original.receptor);
  });
});

describe("importes tecleados a mano", () => {
  it("entiende el punto decimal y el separador de miles", () => {
    expect(aNumero("423.50")).toBe(423.5);
    expect(aNumero("1,234.56")).toBe(1234.56);
  });

  it("entiende la coma decimal en formato español", () => {
    expect(aNumero("423,50")).toBe(423.5);
    expect(aNumero("1.234,56")).toBe(1234.56);
  });

  it("devuelve null con el campo vacío", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("   ")).toBeNull();
  });

  it("devuelve NaN con texto que no es un número", () => {
    expect(aNumero("cuatrocientos")).toBeNaN();
    expect(aNumero("423,50 €")).toBeNaN();
  });
});

describe("todos los problemas a la vez", () => {
  it("señala el descuadre aunque además falten campos obligatorios", () => {
    const rota = {
      ...facturaValida(),
      numero_documento: null,
      fecha_emision: "04/03/2026",
      total: 999,
    };

    // Zod se salta sus refinements en cuanto falla un campo, así que el cuadre
    // se comprueba aparte: si no, el descuadre no aparecería hasta el segundo intento.
    expect(campos(validarExtraccion(rota).problemas)).toEqual([
      "fecha_emision",
      "numero_documento",
      "total",
    ]);
  });

  it("no duplica un problema que ya venía del schema", () => {
    const factura = { ...facturaValida(), total: 500 };
    const { problemas } = validarExtraccion(factura);

    expect(problemas).toHaveLength(1);
  });
});

describe("mensajes", () => {
  it("explica en español los campos que faltan, vengan null o vacíos", () => {
    const nulos = { ...facturaValida(), numero_documento: null, fecha_emision: null, moneda: null };
    const vacios = { ...facturaValida(), numero_documento: "", fecha_emision: "", moneda: "" };

    const mensajes = (datos: Extraccion) =>
      validarExtraccion(datos).problemas.map((p) => p.mensaje);

    for (const lista of [mensajes(nulos), mensajes(vacios)]) {
      expect(lista.some((m) => /número de factura es obligatorio/i.test(m))).toBe(true);
      expect(lista.every((m) => !/Invalid input|expected/i.test(m))).toBe(true);
    }
  });

  it("usa el mismo mensaje de fecha para un texto con otro formato", () => {
    const { problemas } = validarExtraccion({ ...facturaValida(), fecha_emision: "4 marzo 2026" });

    expect(porCampo(problemas)["fecha_emision"]).toEqual([
      "Fecha inválida: usa el formato AAAA-MM-DD",
    ]);
  });
});
