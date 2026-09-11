/**
 * Convierte lo que el usuario escribe en un campo de importe.
 * Acepta "1.234,56" y "1234.56"; devuelve null si está vacío y NaN si no es
 * un número, para poder marcar el campo en rojo sin perder lo tecleado.
 */
export function aNumero(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const usaComaDecimal =
    limpio.includes(",") && limpio.lastIndexOf(",") > limpio.lastIndexOf(".");
  const normalizado = usaComaDecimal
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(/,/g, "");

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}
