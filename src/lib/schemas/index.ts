import { z } from "zod";
import { problemaCuadre, problemaOrden, type Problema } from "./base";
import { SCHEMAS, TIPOS, type TipoDocumento } from "./tipos";

export {
  SCHEMAS,
  TIPOS,
  ETIQUETA_TIPO,
  FacturaSchema,
  ReciboSchema,
  ContratoSchema,
  OtroSchema,
  type TipoDocumento,
} from "./tipos";
export { esFechaISO, TOLERANCIA } from "./base";

/**
 * Forma laxa que se le pide al modelo: todos los campos presentes, casi todos
 * anulables. Las reglas duras viven en el schema del tipo detectado y se aplican
 * después, para poder enseñar en rojo lo que falta en vez de perder la respuesta.
 */
export const ExtraccionBrutaSchema = z.object({
  tipo_documento: z.enum(TIPOS).describe("Clasificación del documento"),
  confianza: z.number().describe("Confianza en la clasificación, de 0 a 1"),
  idioma: z.string().nullable(),
  resumen: z.string().describe("Una frase describiendo el documento"),

  emisor: z
    .object({
      nombre: z.string().nullable(),
      identificacion_fiscal: z.string().nullable(),
      direccion: z.string().nullable(),
    })
    .describe("Quien emite la factura/recibo o primera parte del contrato"),
  receptor: z
    .object({
      nombre: z.string().nullable(),
      identificacion_fiscal: z.string().nullable(),
      direccion: z.string().nullable(),
    })
    .describe("Cliente, pagador o segunda parte del contrato"),

  numero_documento: z.string().nullable(),
  fecha_emision: z.string().nullable().describe("Formato AAAA-MM-DD"),
  fecha_vencimiento: z.string().nullable().describe("Formato AAAA-MM-DD"),
  moneda: z.string().nullable().describe("Código ISO, p. ej. EUR, USD, CLP"),
  subtotal: z.number().nullable().describe("Base imponible, sin impuestos"),
  impuestos: z.number().nullable(),
  total: z.number().nullable(),
  metodo_pago: z.string().nullable(),
  lineas: z
    .array(
      z.object({
        descripcion: z.string(),
        cantidad: z.number().nullable(),
        precio_unitario: z.number().nullable(),
        importe: z.number().nullable(),
      }),
    )
    .describe("Conceptos facturados; vacío si no aplica"),

  contrato: z
    .object({
      objeto: z.string().nullable(),
      fecha_inicio: z.string().nullable().describe("Formato AAAA-MM-DD"),
      fecha_fin: z.string().nullable().describe("Formato AAAA-MM-DD"),
      duracion: z.string().nullable(),
      importe: z.string().nullable(),
      ley_aplicable: z.string().nullable(),
      clausulas_destacadas: z.array(z.string()),
    })
    .nullable()
    .describe("Sólo cuando tipo_documento es contrato; null en caso contrario"),

  notas: z.array(z.string()).describe("Campos ilegibles, dudas o avisos"),

  texto: z
    .string()
    .nullable()
    .describe(
      "Transcripción literal del texto visible del documento, respetando el orden de lectura",
    ),
});

export type Extraccion = z.infer<typeof ExtraccionBrutaSchema>;

/** Un problema apunta a la ruta del campo: "emisor.nombre", "lineas.0.importe". */
export type { Problema } from "./base";

export type Validacion = {
  valido: boolean;
  problemas: Problema[];
};

/**
 * Reglas que cruzan varios campos. Van aparte porque Zod se salta los
 * refinements en cuanto un campo del objeto falla, y aquí interesa enseñar
 * todos los problemas a la vez en el formulario.
 */
function cruzadas(datos: Extraccion): Problema[] {
  const tipo = datos.tipo_documento as TipoDocumento;
  const lista: (Problema | null)[] = [];

  if (tipo === "factura" || tipo === "recibo") {
    lista.push(problemaCuadre(datos));
  }
  if (tipo === "factura") {
    lista.push(
      problemaOrden(
        datos.fecha_emision,
        datos.fecha_vencimiento,
        "fecha_vencimiento",
        "El vencimiento no puede ser anterior a la emisión",
      ),
    );
  }
  if (tipo === "contrato" && datos.contrato) {
    lista.push(
      problemaOrden(
        datos.contrato.fecha_inicio,
        datos.contrato.fecha_fin,
        "contrato.fecha_fin",
        "El fin de vigencia no puede ser anterior al inicio",
      ),
    );
  }

  return lista.filter((p): p is Problema => p !== null);
}

/**
 * Valida una extracción contra el schema de su tipo y devuelve los problemas
 * indexados por campo, para pintarlos en el formulario.
 */
export function validarExtraccion(datos: Extraccion): Validacion {
  const schema = SCHEMAS[datos.tipo_documento as TipoDocumento] ?? SCHEMAS.otro;
  const resultado = schema.safeParse(datos);

  const delSchema: Problema[] = resultado.success
    ? []
    : resultado.error.issues.map((issue) => ({
        campo: issue.path.join("."),
        mensaje: issue.message,
      }));

  const vistos = new Set(delSchema.map((p) => `${p.campo}|${p.mensaje}`));
  const problemas = [
    ...delSchema,
    ...cruzadas(datos).filter((p) => !vistos.has(`${p.campo}|${p.mensaje}`)),
  ];

  return { valido: problemas.length === 0, problemas };
}

/** Índice campo -> mensajes, cómodo para el render. */
export function porCampo(problemas: Problema[]): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const { campo, mensaje } of problemas) {
    (mapa[campo] ??= []).push(mensaje);
  }
  return mapa;
}
