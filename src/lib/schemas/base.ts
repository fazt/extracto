import { z } from "zod";

/** AAAA-MM-DD y además una fecha que exista (rechaza 2026-02-31). */
export function esFechaISO(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [, y, mes, d] = m;
  const fecha = new Date(`${y}-${mes}-${d}T00:00:00Z`);
  return (
    fecha.getUTCFullYear() === Number(y) &&
    fecha.getUTCMonth() + 1 === Number(mes) &&
    fecha.getUTCDate() === Number(d)
  );
}

export const fecha = z
  .string({ error: "La fecha es obligatoria" })
  .refine(esFechaISO, { message: "Fecha inválida: usa el formato AAAA-MM-DD" });

export const fechaOpcional = fecha.nullable();

export const textoRequerido = (campo: string) =>
  z
    // El mismo mensaje tanto si viene null como si viene vacío.
    .string({ error: `${campo} es obligatorio` })
    .trim()
    .min(1, { message: `${campo} es obligatorio` });

export const moneda = z
  .string({ error: "La moneda es obligatoria" })
  .trim()
  .regex(/^[A-Z]{3}$/, { message: "Usa el código ISO de 3 letras (EUR, USD, CLP…)" });

export const importe = (campo: string) =>
  z
    .number({ message: `${campo} es obligatorio` })
    .finite({ message: `${campo} debe ser un número` });

/** Emisor / receptor. `nombreRequerido` lo endurece según el tipo de documento. */
export const parte = (nombreRequerido: boolean, etiqueta: string) =>
  z.object({
    nombre: nombreRequerido
      ? textoRequerido(`El nombre ${etiqueta}`)
      : z.string().nullable(),
    identificacion_fiscal: z.string().nullable(),
    direccion: z.string().nullable(),
  });

export const linea = z.object({
  descripcion: textoRequerido("La descripción de la línea"),
  cantidad: z.number().finite().nullable(),
  precio_unitario: z.number().finite().nullable(),
  importe: z.number().finite().nullable(),
});

export const detalleContrato = z.object({
  objeto: z.string().nullable(),
  fecha_inicio: fechaOpcional,
  fecha_fin: fechaOpcional,
  duracion: z.string().nullable(),
  importe: z.string().nullable(),
  ley_aplicable: z.string().nullable(),
  clausulas_destacadas: z.array(z.string()),
});

/** Tolerancia al comparar importes: dos céntimos absorben el redondeo del IVA. */
export const TOLERANCIA = 0.02;

export type Problema = { campo: string; mensaje: string };

/**
 * subtotal + impuestos = total. Sólo se comprueba si los tres son números.
 * Devuelve el problema en vez de emitirlo para poder aplicarlo también cuando
 * el resto del schema ya ha fallado (Zod no ejecuta los refinements entonces).
 */
export function problemaCuadre(datos: {
  subtotal: number | null;
  impuestos: number | null;
  total: number | null;
}): Problema | null {
  const { subtotal, impuestos, total } = datos;
  if (
    typeof subtotal !== "number" ||
    typeof impuestos !== "number" ||
    typeof total !== "number"
  ) {
    return null;
  }

  const esperado = subtotal + impuestos;
  if (Math.abs(esperado - total) <= TOLERANCIA) return null;

  return {
    campo: "total",
    mensaje: `No cuadra: ${subtotal} + ${impuestos} = ${Number(esperado.toFixed(2))}, no ${total}`,
  };
}

/** La fecha `hasta` no puede ser anterior a `desde`. */
export function problemaOrden(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  campo: string,
  mensaje: string,
): Problema | null {
  if (!desde || !hasta || !esFechaISO(desde) || !esFechaISO(hasta)) return null;
  return hasta < desde ? { campo, mensaje } : null;
}

/** Traslada un problema al canal de issues de Zod. */
export function emitir(problema: Problema | null, ctx: z.RefinementCtx) {
  if (!problema) return;
  ctx.addIssue({
    code: "custom",
    path: problema.campo.split("."),
    message: problema.mensaje,
  });
}
