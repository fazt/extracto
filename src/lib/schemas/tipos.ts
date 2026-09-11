import { z } from "zod";
import {
  detalleContrato,
  emitir,
  fecha,
  fechaOpcional,
  importe,
  linea,
  moneda,
  parte,
  problemaCuadre,
  problemaOrden,
  textoRequerido,
} from "./base";

/** Campos que comparten todos los tipos, en su forma más laxa. */
const comunes = {
  confianza: z.number().min(0).max(1),
  idioma: z.string().nullable(),
  resumen: textoRequerido("El resumen"),
  numero_documento: z.string().nullable(),
  fecha_vencimiento: fechaOpcional,
  metodo_pago: z.string().nullable(),
  notas: z.array(z.string()),
  texto: z.string().nullable(),
};

/** Factura: identifica a las dos partes, lleva número y debe cuadrar. */
export const FacturaSchema = z
  .object({
    ...comunes,
    tipo_documento: z.literal("factura"),
    emisor: parte(true, "del emisor"),
    receptor: parte(true, "del receptor"),
    numero_documento: textoRequerido("El número de factura"),
    fecha_emision: fecha,
    moneda,
    subtotal: importe("La base imponible"),
    impuestos: importe("El importe de impuestos"),
    total: importe("El total"),
    lineas: z.array(linea).min(1, { message: "Una factura necesita al menos una línea" }),
    contrato: detalleContrato.nullable(),
  })
  .superRefine((datos, ctx) => {
    emitir(problemaCuadre(datos), ctx);
    emitir(
      problemaOrden(
        datos.fecha_emision,
        datos.fecha_vencimiento,
        "fecha_vencimiento",
        "El vencimiento no puede ser anterior a la emisión",
      ),
      ctx,
    );
  });

/** Recibo: comprobante de un pago ya hecho; el receptor suele no constar. */
export const ReciboSchema = z
  .object({
    ...comunes,
    tipo_documento: z.literal("recibo"),
    emisor: parte(true, "del emisor"),
    receptor: parte(false, "del receptor"),
    fecha_emision: fecha,
    moneda,
    subtotal: z.number().finite().nullable(),
    impuestos: z.number().finite().nullable(),
    total: importe("El total"),
    lineas: z.array(linea),
    contrato: detalleContrato.nullable(),
  })
  .superRefine((datos, ctx) => {
    emitir(problemaCuadre(datos), ctx);
  });

/** Contrato: dos partes, objeto y vigencia; sin aritmética de importes. */
export const ContratoSchema = z
  .object({
    ...comunes,
    tipo_documento: z.literal("contrato"),
    emisor: parte(true, "de la primera parte"),
    receptor: parte(true, "de la segunda parte"),
    fecha_emision: fechaOpcional,
    moneda: moneda.nullable(),
    subtotal: z.number().finite().nullable(),
    impuestos: z.number().finite().nullable(),
    total: z.number().finite().nullable(),
    lineas: z.array(linea),
    contrato: z.object({
      ...detalleContrato.shape,
      objeto: textoRequerido("El objeto del contrato"),
      fecha_inicio: fecha,
    }),
  })
  .superRefine((datos, ctx) => {
    emitir(
      problemaOrden(
        datos.contrato.fecha_inicio,
        datos.contrato.fecha_fin,
        "contrato.fecha_fin",
        "El fin de vigencia no puede ser anterior al inicio",
      ),
      ctx,
    );
  });

/** Otro: no imponemos más que un resumen legible. */
export const OtroSchema = z.object({
  ...comunes,
  tipo_documento: z.literal("otro"),
  emisor: parte(false, "del emisor"),
  receptor: parte(false, "del receptor"),
  fecha_emision: fechaOpcional,
  moneda: moneda.nullable(),
  subtotal: z.number().finite().nullable(),
  impuestos: z.number().finite().nullable(),
  total: z.number().finite().nullable(),
  lineas: z.array(linea),
  contrato: detalleContrato.nullable(),
});

export const SCHEMAS = {
  factura: FacturaSchema,
  recibo: ReciboSchema,
  contrato: ContratoSchema,
  otro: OtroSchema,
} as const;

export type TipoDocumento = keyof typeof SCHEMAS;

export const TIPOS = Object.keys(SCHEMAS) as TipoDocumento[];

export const ETIQUETA_TIPO: Record<TipoDocumento, string> = {
  factura: "Factura",
  recibo: "Recibo",
  contrato: "Contrato",
  otro: "Otro",
};
