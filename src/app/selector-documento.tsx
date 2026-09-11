"use client";

import { useEffect, useRef, useState } from "react";
import { IconoChevron, IconoConforme, IconoDocumento } from "./iconos";
import { ETIQUETA_TIPO } from "@/lib/schemas";
import type { Doc } from "./uploader";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * El documento abierto y la forma de cambiarlo, sobre el propio visor.
 * Vive aquí y no en la barra superior: con más de tres archivos, una fila de
 * fichas se come la barra y deja de leerse.
 */
export default function SelectorDocumento({
  docs,
  selected,
  archivados,
  onElegir,
}: {
  docs: Doc[];
  selected: Doc;
  archivados: Set<string>;
  onElegir: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const otros = docs.length - 1;

  return (
    <div ref={caja} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] transition hover:bg-sunken"
      >
        <IconoDocumento className="h-3.5 w-3.5 shrink-0 text-label" />
        <span className="truncate text-ink">{selected.filename}</span>
        {otros > 0 && (
          <span className="cifra shrink-0 text-label">
            +{otros}
          </span>
        )}
        <IconoChevron
          className={`h-3.5 w-3.5 shrink-0 text-label transition ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <ul
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-[60vh] w-[320px] overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)]"
        >
          {docs.map((doc) => {
            const activo = doc.id === selected.id;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={activo}
                  onClick={() => {
                    onElegir(doc.id);
                    setAbierto(false);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition hover:bg-sunken ${
                    activo ? "bg-accent-soft" : ""
                  }`}
                >
                  <IconoDocumento
                    className={`h-3.5 w-3.5 shrink-0 ${activo ? "text-accent" : "text-label"}`}
                  />
                  <span className={`min-w-0 flex-1 truncate ${activo ? "text-accent" : ""}`}>
                    {doc.filename}
                  </span>
                  {doc.doc_type && (
                    <span className="shrink-0 text-[12px] text-label">
                      {ETIQUETA_TIPO[doc.doc_type as "otro"] ?? doc.doc_type}
                    </span>
                  )}
                  <span className="cifra shrink-0 text-[12px] text-label">
                    {formatSize(Number(doc.size_bytes))}
                  </span>
                  {archivados.has(doc.id) && (
                    <IconoConforme className="h-3.5 w-3.5 shrink-0 text-ok" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
