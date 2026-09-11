import type { Extraccion } from "@/lib/schemas";

/** Extracción mínima con todos los campos presentes, como la devuelve el modelo. */
export function base(): Extraccion {
  return {
    tipo_documento: "otro",
    confianza: 0.9,
    idioma: "es",
    resumen: "Documento de prueba",
    emisor: { nombre: null, identificacion_fiscal: null, direccion: null },
    receptor: { nombre: null, identificacion_fiscal: null, direccion: null },
    numero_documento: null,
    fecha_emision: null,
    fecha_vencimiento: null,
    moneda: null,
    subtotal: null,
    impuestos: null,
    total: null,
    metodo_pago: null,
    lineas: [],
    contrato: null,
    notas: [],
    texto: "Documento de prueba. Total: 0",
  };
}

export function facturaValida(): Extraccion {
  return {
    ...base(),
    tipo_documento: "factura",
    confianza: 1,
    resumen: "Factura de café para una cafetería",
    emisor: {
      nombre: "Tostadores del Sur S.L.",
      identificacion_fiscal: "B-87654321",
      direccion: "Calle Mayor 14, Madrid",
    },
    receptor: {
      nombre: "Cafetería La Esquina S.L.",
      identificacion_fiscal: "B-12345678",
      direccion: "Av. Diagonal 221, Barcelona",
    },
    numero_documento: "F-2026/0418",
    fecha_emision: "2026-03-04",
    fecha_vencimiento: "2026-04-03",
    moneda: "EUR",
    subtotal: 350,
    impuestos: 73.5,
    total: 423.5,
    metodo_pago: "Transferencia",
    lineas: [
      { descripcion: "Café en grano 1 kg", cantidad: 12, precio_unitario: 14.5, importe: 174 },
      { descripcion: "Mantenimiento molino", cantidad: 1, precio_unitario: 176, importe: 176 },
    ],
  };
}

export function reciboValido(): Extraccion {
  return {
    ...base(),
    tipo_documento: "recibo",
    resumen: "Recibo de compra en supermercado",
    emisor: {
      nombre: "Supermercat Roure",
      identificacion_fiscal: "B-55443322",
      direccion: "C/ Bruc 88, Barcelona",
    },
    fecha_emision: "2026-02-07",
    moneda: "EUR",
    subtotal: 26.6,
    impuestos: 2.66,
    total: 29.26,
    metodo_pago: "Tarjeta",
    lineas: [{ descripcion: "Leche entera 1L", cantidad: 3, precio_unitario: 1.15, importe: 3.45 }],
  };
}

export function contratoValido(): Extraccion {
  return {
    ...base(),
    tipo_documento: "contrato",
    resumen: "Contrato de arrendamiento de local",
    emisor: {
      nombre: "Miguel Arnau Ferrer",
      identificacion_fiscal: "44556677X",
      direccion: "Calle Colón 45, Valencia",
    },
    receptor: {
      nombre: "Estudio Lumen S.L.",
      identificacion_fiscal: "B-99887766",
      direccion: "Gran Vía Marqués del Turia 8, Valencia",
    },
    fecha_emision: "2026-01-15",
    contrato: {
      objeto: "Arrendamiento del local de Calle Sorní 12",
      fecha_inicio: "2026-02-01",
      fecha_fin: "2029-01-31",
      duracion: "3 años",
      importe: "1.250,00 euros mensuales",
      ley_aplicable: "Ley 29/1994",
      clausulas_destacadas: ["Fianza de 2.500 euros"],
    },
  };
}

/** Campos con problemas, ordenados, para comparar sin depender del orden. */
export function campos(problemas: { campo: string }[]): string[] {
  return [...new Set(problemas.map((p) => p.campo))].sort();
}
