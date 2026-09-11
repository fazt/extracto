import type { TipoDocumento } from "./tipos";

export type TipoCampo = "texto" | "numero" | "fecha" | "parrafo";

export type Campo = {
  /** Ruta dentro de la extracción, p. ej. "emisor.nombre". */
  path: string;
  label: string;
  tipo: TipoCampo;
  ancho?: "completo";
};

export type Seccion = {
  titulo: string;
  campos: Campo[];
};

const parte = (raiz: "emisor" | "receptor", titulo: string): Seccion => ({
  titulo,
  campos: [
    { path: `${raiz}.nombre`, label: "Nombre", tipo: "texto", ancho: "completo" },
    { path: `${raiz}.identificacion_fiscal`, label: "NIF / CIF", tipo: "texto" },
    { path: `${raiz}.direccion`, label: "Dirección", tipo: "texto", ancho: "completo" },
  ],
});

const documento = (campos: Campo[]): Seccion => ({ titulo: "Documento", campos });

const importes: Seccion = {
  titulo: "Importes",
  campos: [
    { path: "moneda", label: "Moneda", tipo: "texto" },
    { path: "subtotal", label: "Base imponible", tipo: "numero" },
    { path: "impuestos", label: "Impuestos", tipo: "numero" },
    { path: "total", label: "Total", tipo: "numero" },
  ],
};

const resumen: Seccion = {
  titulo: "Resumen",
  campos: [{ path: "resumen", label: "Resumen", tipo: "parrafo", ancho: "completo" }],
};

export const SECCIONES: Record<TipoDocumento, Seccion[]> = {
  factura: [
    resumen,
    documento([
      { path: "numero_documento", label: "Nº de factura", tipo: "texto" },
      { path: "fecha_emision", label: "Fecha de emisión", tipo: "fecha" },
      { path: "fecha_vencimiento", label: "Vencimiento", tipo: "fecha" },
      { path: "metodo_pago", label: "Forma de pago", tipo: "texto" },
    ]),
    parte("emisor", "Emisor"),
    parte("receptor", "Receptor"),
    importes,
  ],
  recibo: [
    resumen,
    documento([
      { path: "numero_documento", label: "Nº de recibo", tipo: "texto" },
      { path: "fecha_emision", label: "Fecha", tipo: "fecha" },
      { path: "metodo_pago", label: "Forma de pago", tipo: "texto" },
    ]),
    parte("emisor", "Emisor"),
    parte("receptor", "Receptor (opcional)"),
    importes,
  ],
  contrato: [
    resumen,
    documento([
      { path: "numero_documento", label: "Referencia", tipo: "texto" },
      { path: "fecha_emision", label: "Fecha de firma", tipo: "fecha" },
    ]),
    parte("emisor", "Primera parte"),
    parte("receptor", "Segunda parte"),
    {
      titulo: "Contrato",
      campos: [
        { path: "contrato.objeto", label: "Objeto", tipo: "texto", ancho: "completo" },
        { path: "contrato.fecha_inicio", label: "Inicio de vigencia", tipo: "fecha" },
        { path: "contrato.fecha_fin", label: "Fin de vigencia", tipo: "fecha" },
        { path: "contrato.duracion", label: "Duración", tipo: "texto" },
        { path: "contrato.importe", label: "Importe", tipo: "texto" },
        {
          path: "contrato.ley_aplicable",
          label: "Ley aplicable",
          tipo: "texto",
          ancho: "completo",
        },
      ],
    },
  ],
  otro: [
    resumen,
    documento([
      { path: "numero_documento", label: "Referencia", tipo: "texto" },
      { path: "fecha_emision", label: "Fecha", tipo: "fecha" },
    ]),
    parte("emisor", "Emisor"),
    parte("receptor", "Receptor"),
    importes,
  ],
};

/** Los contratos no usan la tabla de líneas. */
export const MUESTRA_LINEAS: Record<TipoDocumento, boolean> = {
  factura: true,
  recibo: true,
  contrato: false,
  otro: true,
};

export function leer(objeto: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, clave) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[clave] : undefined,
      objeto,
    );
}

/** Devuelve una copia con `path` reemplazado (sin mutar el original). */
export function escribir<T>(objeto: T, path: string, valor: unknown): T {
  const [clave, ...resto] = path.split(".");
  const fuente = (objeto ?? {}) as Record<string, unknown>;

  if (resto.length === 0) {
    return { ...fuente, [clave]: valor } as T;
  }

  const hijo = fuente[clave] ?? {};
  return { ...fuente, [clave]: escribir(hijo, resto.join("."), valor) } as T;
}
