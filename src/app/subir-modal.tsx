"use client";

import { useEffect, useRef, useState } from "react";
import { IconoAviso, IconoQuitar, IconoSubir } from "./iconos";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export default function SubirModal({
  subiendo,
  onCerrar,
  onArchivo,
}: {
  subiendo: boolean;
  onCerrar: () => void;
  onArchivo: (file: File) => void;
}) {
  const [dentro, setDentro] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === "Escape" && !subiendo && onCerrar();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [subiendo, onCerrar]);

  /** El navegador deja soltar cualquier cosa: el filtro vive aquí, no en el accept. */
  const aceptar = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      setRechazo(`${file.name} es un ${file.type || "tipo desconocido"}: sólo entran imágenes y PDF.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setRechazo(`${file.name} pesa más de 20 MB.`);
      return;
    }
    setRechazo(null);
    onArchivo(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={() => !subiendo && onCerrar()}
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Subir documento"
        className="entra relative w-full max-w-[520px] rounded-xl border border-line bg-surface shadow-[0_16px_48px_-16px_rgba(15,23,42,0.35)]"
      >
        <header className="flex h-12 items-center gap-3 border-b border-line px-4">
          <h2 className="text-[13px] font-medium">Subir documento</h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={subiendo}
            aria-label="Cerrar"
            className="ml-auto rounded-md p-1 text-label transition hover:bg-sunken hover:text-ink disabled:opacity-40"
          >
            <IconoQuitar />
          </button>
        </header>

        <div className="p-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              aceptar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDentro(true);
            }}
            onDragLeave={() => setDentro(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDentro(false);
              aceptar(e.dataTransfer.files?.[0]);
            }}
            disabled={subiendo}
            className={`flex w-full flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
              dentro
                ? "border-accent bg-accent-soft"
                : "border-line bg-sunken hover:border-line-strong"
            } disabled:opacity-60`}
          >
            <IconoSubir className="h-6 w-6 text-label" />
            <span className="text-[14px] font-medium">
              {subiendo ? "Subiendo…" : "Arrastra el documento aquí o haz clic para elegirlo"}
            </span>
            <span className="text-[12px] text-label">
              Factura, recibo o contrato · PNG, JPG, WebP, GIF o PDF · hasta 20 MB
            </span>
          </button>

          {rechazo && (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-danger">
              <IconoAviso className="mt-0.5 h-3.5 w-3.5" />
              {rechazo}
            </p>
          )}

          <p className="mt-3 text-[12px] leading-relaxed text-label">
            Los PDF escaneados también se leen: pasan por OCR antes de extraer los campos.
          </p>
        </div>
      </div>
    </div>
  );
}
