"use client";

import { useMemo, useState } from "react";
import {
  ETIQUETA_TIPO,
  TIPOS,
  porCampo,
  validarExtraccion,
  type Extraccion,
  type TipoDocumento,
} from "@/lib/schemas";
import { MUESTRA_LINEAS, SECCIONES, escribir, leer, type Campo } from "@/lib/schemas/campos";
import { aNumero } from "@/lib/numero";

const CONTRATO_VACIO = {
  objeto: null,
  fecha_inicio: null,
  fecha_fin: null,
  duracion: null,
  importe: null,
  ley_aplicable: null,
  clausulas_destacadas: [] as string[],
};

const LINEA_VACIA = {
  descripcion: "",
  cantidad: null,
  precio_unitario: null,
  importe: null,
};

export default function DatosForm({
  extraccion,
  onChange,
  onGuardar,
  onConfirmar,
  guardando,
  confirmando,
  aviso,
}: {
  extraccion: Extraccion;
  onChange: (siguiente: Extraccion) => void;
  onGuardar: () => void;
  onConfirmar: () => void;
  guardando: boolean;
  confirmando: boolean;
  aviso: string | null;
}) {
  // Texto tal cual lo escribe el usuario en los campos numéricos, para no
  // perder lo tecleado mientras el valor todavía no es un número válido.
  const [borradores, setBorradores] = useState<Record<string, string>>({});

  const tipo = extraccion.tipo_documento as TipoDocumento;

  const problemas = useMemo(() => {
    const delSchema = validarExtraccion(extraccion).problemas;
    const deFormato = Object.entries(borradores)
      .filter(([, texto]) => Number.isNaN(aNumero(texto)))
      .map(([campo]) => ({ campo, mensaje: "No es un número válido" }));
    return [...delSchema, ...deFormato];
  }, [extraccion, borradores]);

  const errores = useMemo(() => porCampo(problemas), [problemas]);

  const set = (path: string, valor: unknown) => onChange(escribir(extraccion, path, valor));

  /** Al salir del campo dejamos de mostrar el texto crudo y mandamos el valor. */
  const olvidarBorrador = (path: string) =>
    setBorradores((b) => {
      const resto = { ...b };
      delete resto[path];
      return resto;
    });

  const cambiarTipo = (nuevo: TipoDocumento) => {
    let siguiente = escribir(extraccion, "tipo_documento", nuevo);
    if (nuevo === "contrato" && !siguiente.contrato) {
      siguiente = escribir(siguiente, "contrato", { ...CONTRATO_VACIO });
    }
    onChange(siguiente);
  };

  const campoTexto = (campo: Campo) => {
    const valor = leer(extraccion, campo.path);
    const malos = errores[campo.path];

    if (campo.tipo === "numero") {
      const borrador = borradores[campo.path];
      const mostrado = borrador ?? (valor === null || valor === undefined ? "" : String(valor));
      return (
        <input
          inputMode="decimal"
          value={mostrado}
          onChange={(e) => {
            const texto = e.target.value;
            setBorradores((b) => ({ ...b, [campo.path]: texto }));
            const n = aNumero(texto);
            set(campo.path, Number.isNaN(n) ? null : n);
          }}
          onBlur={() => olvidarBorrador(campo.path)}
          className={entrada(!!malos)}
        />
      );
    }

    return (
      <input
        type={campo.tipo === "fecha" ? "text" : "text"}
        placeholder={campo.tipo === "fecha" ? "AAAA-MM-DD" : undefined}
        value={valor === null || valor === undefined ? "" : String(valor)}
        onChange={(e) => set(campo.path, e.target.value === "" ? null : e.target.value)}
        className={entrada(!!malos)}
      />
    );
  };

  const secciones = SECCIONES[tipo] ?? SECCIONES.otro;
  const erroresDeLineas = errores["lineas"] ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted">
            Tipo
          </label>
          <select
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as TipoDocumento)}
            className="rounded-lg border border-border-soft bg-background px-2.5 py-1.5 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            {Math.round(extraccion.confianza * 100)}% de confianza
          </span>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            problemas.length === 0
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {problemas.length === 0
            ? "Válido"
            : `${problemas.length} ${problemas.length === 1 ? "problema" : "problemas"}`}
        </span>
      </div>

      {secciones.map((seccion) => (
        <fieldset key={seccion.titulo} className="space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wider text-muted">
            {seccion.titulo}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {seccion.campos.map((campo) => {
              const malos = errores[campo.path];
              return (
                <div
                  key={campo.path}
                  className={campo.ancho === "completo" ? "col-span-2" : "col-span-2 sm:col-span-1"}
                >
                  <label
                    className={`mb-1 block text-xs ${malos ? "text-red-600 dark:text-red-400" : "text-muted"}`}
                  >
                    {campo.label}
                  </label>
                  {campoTexto(campo)}
                  {malos?.map((m) => (
                    <p key={m} className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {m}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {MUESTRA_LINEAS[tipo] && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wider text-muted">
            Líneas
          </legend>

          {erroresDeLineas.map((m) => (
            <p key={m} className="text-xs text-red-600 dark:text-red-400">
              {m}
            </p>
          ))}

          <div className="space-y-2">
            {extraccion.lineas.map((linea, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                {(
                  [
                    ["descripcion", "col-span-12 sm:col-span-5", "Descripción"],
                    ["cantidad", "col-span-4 sm:col-span-2", "Cant."],
                    ["precio_unitario", "col-span-4 sm:col-span-2", "Precio"],
                    ["importe", "col-span-4 sm:col-span-2", "Importe"],
                  ] as const
                ).map(([clave, clase, etiqueta]) => {
                  const path = `lineas.${i}.${clave}`;
                  const malos = errores[path];
                  const esNumero = clave !== "descripcion";
                  const borrador = borradores[path];
                  const valor = linea[clave];
                  const mostrado =
                    borrador ?? (valor === null || valor === undefined ? "" : String(valor));
                  return (
                    <div key={clave} className={clase}>
                      <input
                        aria-label={`${etiqueta} línea ${i + 1}`}
                        placeholder={etiqueta}
                        inputMode={esNumero ? "decimal" : undefined}
                        value={mostrado}
                        onChange={(e) => {
                          const texto = e.target.value;
                          if (esNumero) {
                            setBorradores((b) => ({ ...b, [path]: texto }));
                            const n = aNumero(texto);
                            actualizarLinea(i, clave, Number.isNaN(n) ? null : n);
                          } else {
                            actualizarLinea(i, clave, texto);
                          }
                        }}
                        onBlur={() => olvidarBorrador(path)}
                        className={entrada(!!malos)}
                      />
                      {malos?.map((m) => (
                        <p key={m} className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {m}
                        </p>
                      ))}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "lineas",
                      extraccion.lineas.filter((_, j) => j !== i),
                    )
                  }
                  className="col-span-12 justify-self-end text-xs text-muted hover:text-red-600 sm:col-span-1 sm:justify-self-center"
                  aria-label={`Eliminar línea ${i + 1}`}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => set("lineas", [...extraccion.lineas, { ...LINEA_VACIA }])}
            className="text-xs text-accent hover:underline"
          >
            + Añadir línea
          </button>
        </fieldset>
      )}

      {tipo === "contrato" && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wider text-muted">
            Cláusulas destacadas
          </legend>
          <textarea
            rows={4}
            value={(extraccion.contrato?.clausulas_destacadas ?? []).join("\n")}
            onChange={(e) =>
              set(
                "contrato.clausulas_destacadas",
                e.target.value.split("\n").filter((l) => l.trim() !== ""),
              )
            }
            className={entrada(false)}
            placeholder="Una cláusula por línea"
          />
        </fieldset>
      )}

      {extraccion.notas.length > 0 && (
        <div className="rounded-lg border border-border-soft bg-foreground/[0.03] p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
            Notas del modelo
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {extraccion.notas.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border-soft pt-4">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={confirmando || guardando || problemas.length > 0}
          title={
            problemas.length > 0
              ? "Corrige los campos en rojo para poder confirmar"
              : "Guarda los datos en tablas e indexa el texto"
          }
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#0b0b0d]"
        >
          {confirmando ? "Guardando…" : "Confirmar y guardar"}
        </button>

        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || confirmando}
          className="rounded-lg border border-border-soft px-4 py-2 text-sm transition hover:border-accent/60 disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar borrador"}
        </button>

        {problemas.length > 0 ? (
          <span className="text-xs text-muted">
            Corrige los campos en rojo para poder confirmar.
          </span>
        ) : (
          aviso && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{aviso}</span>
          )
        )}
      </div>
    </div>
  );

  function actualizarLinea(indice: number, clave: string, valor: unknown) {
    set(
      "lineas",
      extraccion.lineas.map((l, j) => (j === indice ? { ...l, [clave]: valor } : l)),
    );
  }
}

function entrada(conError: boolean) {
  return `w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none transition focus:ring-2 ${
    conError
      ? "border-red-500 bg-red-500/5 text-red-700 focus:ring-red-500/30 dark:text-red-300"
      : "border-border-soft bg-background focus:ring-accent/30"
  }`;
}
