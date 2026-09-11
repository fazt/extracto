"use client";

import { useMemo, useState } from "react";
import { IconoAviso, IconoConforme, IconoMas, IconoQuitar } from "./iconos";
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

const LINEA_VACIA = { descripcion: "", cantidad: null, precio_unitario: null, importe: null };

/** Campo de entrada: plano hasta que lo tocas, con filete ámbar cuando reclama atención. */
function entrada(conError: boolean, cifra = false) {
  return [
    "w-full rounded-md border bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition",
    "placeholder:text-label/70 hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15",
    cifra ? "cifra text-right" : "",
    conError ? "border-warn/60 bg-warn-soft" : "border-line",
  ].join(" ");
}

export default function DatosForm({
  extraccion,
  confirmado,
  onChange,
  onGuardar,
  onConfirmar,
  guardando,
  confirmando,
  aviso,
}: {
  extraccion: Extraccion;
  confirmado: boolean;
  onChange: (siguiente: Extraccion) => void;
  onGuardar: () => void;
  onConfirmar: () => void;
  guardando: boolean;
  confirmando: boolean;
  aviso: string | null;
}) {
  // Texto tal cual lo escribe el usuario en los campos numéricos, para no perder
  // lo tecleado mientras el valor todavía no es un número válido.
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

  const actualizarLinea = (indice: number, clave: string, valor: unknown) =>
    set(
      "lineas",
      extraccion.lineas.map((l, j) => (j === indice ? { ...l, [clave]: valor } : l)),
    );

  const campoEntrada = (campo: Campo) => {
    const valor = leer(extraccion, campo.path);
    const malos = errores[campo.path];

    if (campo.tipo === "parrafo") {
      return (
        <textarea
          rows={2}
          placeholder="—"
          aria-invalid={malos ? true : undefined}
          value={valor === null || valor === undefined ? "" : String(valor)}
          onChange={(e) => set(campo.path, e.target.value === "" ? null : e.target.value)}
          className={`${entrada(!!malos)} resize-y leading-relaxed`}
        />
      );
    }

    const esNumero = campo.tipo === "numero";
    const borrador = borradores[campo.path];
    const mostrado = esNumero
      ? (borrador ?? (valor === null || valor === undefined ? "" : String(valor)))
      : valor === null || valor === undefined
        ? ""
        : String(valor);

    return (
      <input
        inputMode={esNumero ? "decimal" : undefined}
        placeholder={campo.tipo === "fecha" ? "AAAA-MM-DD" : "—"}
        aria-invalid={malos ? true : undefined}
        value={mostrado}
        onChange={(e) => {
          const texto = e.target.value;
          if (esNumero) {
            setBorradores((b) => ({ ...b, [campo.path]: texto }));
            const n = aNumero(texto);
            set(campo.path, Number.isNaN(n) ? null : n);
          } else {
            set(campo.path, texto === "" ? null : texto);
          }
        }}
        onBlur={() => esNumero && olvidarBorrador(campo.path)}
        className={entrada(!!malos, esNumero)}
      />
    );
  };

  const secciones = SECCIONES[tipo] ?? SECCIONES.otro;
  const erroresDeLineas = errores["lineas"] ?? [];
  const valido = problemas.length === 0;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <label htmlFor="tipo-doc" className="text-[11px] font-medium uppercase tracking-[0.06em] text-label">
            Tipo
          </label>
          <select
            id="tipo-doc"
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as TipoDocumento)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] outline-none transition hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>

          <span className="cifra text-[13px] text-label">
            {Math.round(extraccion.confianza * 100)}% de confianza
          </span>

          <span
            className={`ml-auto flex items-center gap-1.5 text-[13px] ${
              valido ? "text-ok" : "text-warn"
            }`}
          >
            {valido ? (
              <>
                <IconoConforme className="h-3.5 w-3.5" />
                Sin problemas
              </>
            ) : (
              <>
                <IconoAviso className="h-3.5 w-3.5" />
                {problemas.length}{" "}
                {problemas.length === 1 ? "campo por revisar" : "campos por revisar"}
              </>
            )}
          </span>
        </div>

        {secciones.map((seccion) => (
          <fieldset key={seccion.titulo} className="border-b border-line px-4 py-3.5">
            <legend className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label">
              {seccion.titulo}
            </legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {seccion.campos.map((campo) => {
                const malos = errores[campo.path];
                return (
                  <div
                    key={campo.path}
                    className={campo.ancho === "completo" ? "col-span-2" : "col-span-2 sm:col-span-1"}
                  >
                    <label className="mb-1 block text-[12px] text-label">{campo.label}</label>
                    {campoEntrada(campo)}
                    {malos?.map((m) => (
                      <p key={m} className="mt-1 flex items-start gap-1 text-[12px] text-warn">
                        <IconoAviso className="mt-[3px] h-3 w-3" />
                        <span>{m}</span>
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        {MUESTRA_LINEAS[tipo] && (
          <fieldset className="border-b border-line px-4 py-3.5">
            <legend className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label">
              Líneas
            </legend>

            {erroresDeLineas.map((m) => (
              <p key={m} className="mb-2 flex items-center gap-1 text-[12px] text-warn">
                <IconoAviso className="h-3 w-3" />
                {m}
              </p>
            ))}

            {extraccion.lineas.length > 0 && (
              <div className="mb-1 grid grid-cols-[1fr_56px_72px_80px_24px] gap-2 px-0.5 text-[11px] uppercase tracking-[0.06em] text-label">
                <span>Descripción</span>
                <span className="text-right">Cant.</span>
                <span className="text-right">Precio</span>
                <span className="text-right">Importe</span>
                <span />
              </div>
            )}

            <div className="space-y-1.5">
              {extraccion.lineas.map((linea, i) => (
                <div key={i} className="grid grid-cols-[1fr_56px_72px_80px_24px] items-start gap-2">
                  {(
                    [
                      ["descripcion", "Descripción"],
                      ["cantidad", "Cantidad"],
                      ["precio_unitario", "Precio unitario"],
                      ["importe", "Importe"],
                    ] as const
                  ).map(([clave, etiqueta]) => {
                    const path = `lineas.${i}.${clave}`;
                    const malos = errores[path];
                    const esNumero = clave !== "descripcion";
                    const valor = linea[clave];
                    const mostrado =
                      borradores[path] ??
                      (valor === null || valor === undefined ? "" : String(valor));
                    return (
                      <div key={clave}>
                        <input
                          aria-label={`${etiqueta}, línea ${i + 1}`}
                          placeholder="—"
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
                          onBlur={() => esNumero && olvidarBorrador(path)}
                          className={entrada(!!malos, esNumero)}
                        />
                        {malos?.map((m) => (
                          <p key={m} className="mt-1 text-[12px] text-warn">
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
                    aria-label={`Quitar línea ${i + 1}`}
                    className="mt-1.5 text-label transition hover:text-danger"
                  >
                    <IconoQuitar className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => set("lineas", [...extraccion.lineas, { ...LINEA_VACIA }])}
              className="mt-2 flex items-center gap-1 text-[13px] text-accent transition hover:underline"
            >
              <IconoMas className="h-3.5 w-3.5" />
              Añadir línea
            </button>
          </fieldset>
        )}

        {tipo === "contrato" && (
          <fieldset className="border-b border-line px-4 py-3.5">
            <legend className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-label">
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
              placeholder="Una cláusula por línea"
              className={entrada(false)}
            />
          </fieldset>
        )}

        {extraccion.notas.length > 0 && (
          <div className="px-4 py-3.5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-label">
              Notas del modelo
            </p>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-soft">
              {extraccion.notas.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-label">
                    —
                  </span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
        {aviso && (
          <span className="flex items-center gap-1.5 text-[13px] text-ok">
            <IconoConforme className="h-3.5 w-3.5" />
            {aviso}
          </span>
        )}
        {!valido && (
          <span className="text-[13px] text-label">
            Corrige los campos marcados para poder archivar.
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando || confirmando}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-line-strong hover:bg-sunken disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={confirmando || guardando || !valido}
            title={valido ? undefined : "Corrige los campos marcados"}
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmando ? "Archivando…" : confirmado ? "Volver a archivar" : "Confirmar y archivar"}
          </button>
        </div>
      </div>
    </>
  );
}
