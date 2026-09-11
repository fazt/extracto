"use client";

import { useCallback, useRef, useState } from "react";
import Chat from "./chat";
import DatosForm from "./datos-form";
import ListaRegistros from "./lista-registros";
import { ETIQUETA_TIPO, type Extraccion } from "@/lib/schemas";
import type { Registro } from "@/lib/registros";

export type Doc = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
  doc_type: string | null;
  extraction: Extraccion | null;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Uploader({
  initialDocs,
  initialRegistros,
  dbError,
}: {
  initialDocs: Doc[];
  initialRegistros: Registro[];
  dbError: string | null;
}) {
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [registros, setRegistros] = useState<Registro[]>(initialRegistros);
  const [selectedId, setSelectedId] = useState<string | null>(initialDocs[0]?.id ?? null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(dbError);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = docs.find((d) => d.id === selectedId) ?? null;
  const confirmado = registros.some((r) => r.document_id === selectedId);

  const actualizar = useCallback((id: string, cambios: Partial<Doc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...cambios } : d)));
  }, []);

  const refrescarRegistros = useCallback(async () => {
    const res = await fetch("/api/registros");
    if (res.ok) setRegistros(await res.json());
  }, []);

  const upload = useCallback(async (file: File) => {
    setError(null);
    setAviso(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir el archivo");
      const doc: Doc = { ...data, doc_type: null, extraction: null };
      setDocs((prev) => [doc, ...prev]);
      setSelectedId(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setUploading(false);
    }
  }, []);

  const analyze = useCallback(
    async (id: string) => {
      setError(null);
      setAviso(null);
      setAnalyzing(true);
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al analizar el documento");
        actualizar(id, { doc_type: data.doc_type, extraction: data.extraction });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setAnalyzing(false);
      }
    },
    [actualizar],
  );

  /** Sube el borrador tal y como está en pantalla. */
  const guardarBorrador = useCallback(async (doc: Doc) => {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraction: doc.extraction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
    return data;
  }, []);

  const guardar = useCallback(async () => {
    if (!selected?.extraction) return;
    setError(null);
    setGuardando(true);
    try {
      const data = await guardarBorrador(selected);
      actualizar(selected.id, { doc_type: data.extraction.tipo_documento });
      setAviso("Borrador guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }, [selected, actualizar, guardarBorrador]);

  const confirmar = useCallback(async () => {
    if (!selected?.extraction) return;
    setError(null);
    setAviso(null);
    setConfirmando(true);
    try {
      // Primero se persiste lo que hay en pantalla; luego se confirma.
      await guardarBorrador(selected);

      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo confirmar");

      actualizar(selected.id, { doc_type: selected.extraction.tipo_documento });
      await refrescarRegistros();
      setAviso(
        `Guardado: ${data.lineas} ${data.lineas === 1 ? "línea" : "líneas"} y ${data.chunks} ${
          data.chunks === 1 ? "fragmento" : "fragmentos"
        } con embedding`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setConfirmando(false);
    }
  }, [selected, actualizar, guardarBorrador, refrescarRegistros]);

  /** Trae un documento guardado al panel de arriba. */
  const abrirDocumento = useCallback((documentId: string) => {
    setSelectedId(documentId);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <>
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragging
            ? "border-accent bg-accent/5"
            : "border-border-soft bg-surface hover:border-accent/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        <p className="text-base font-medium">
          {uploading ? "Subiendo…" : "Arrastra un archivo o haz clic para elegirlo"}
        </p>
        <p className="text-xs text-muted">PNG, JPG, WebP, GIF o PDF · hasta 20 MB</p>
      </section>

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => {
                setSelectedId(doc.id);
                setAviso(null);
              }}
              title={doc.filename}
              className={`max-w-[260px] truncate rounded-full border px-3 py-1.5 text-xs transition ${
                selectedId === doc.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-soft text-muted hover:border-accent/50"
              }`}
            >
              {doc.filename}
              <span className="opacity-70">
                {" · "}
                {formatSize(Number(doc.size_bytes))}
                {doc.doc_type ? ` · ${ETIQUETA_TIPO[doc.doc_type as "otro"] ?? doc.doc_type}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="grid flex-1 items-start gap-6 lg:grid-cols-2">
        {/* Documento */}
        <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface lg:sticky lg:top-6">
          {!selected ? (
            <div className="flex h-[70vh] items-center justify-center text-sm text-muted">
              La vista previa aparecerá aquí.
            </div>
          ) : selected.mime_type === "application/pdf" ? (
            <object
              data={`/api/files/${selected.id}`}
              type="application/pdf"
              className="h-[70vh] w-full"
            >
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                Tu navegador no puede mostrar el PDF.
                <a className="ml-1 underline" href={`/api/files/${selected.id}`}>
                  Ábrelo en una pestaña
                </a>
              </div>
            </object>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${selected.id}`}
              alt={selected.filename}
              className="mx-auto max-h-[70vh] w-auto object-contain p-4"
            />
          )}
        </div>

        {/* Datos */}
        <div className="rounded-2xl border border-border-soft bg-surface p-4">
          {!selected ? (
            <p className="flex h-[70vh] items-center justify-center text-sm text-muted">
              Selecciona un archivo.
            </p>
          ) : !selected.extraction ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
              <p className="max-w-xs text-sm text-muted">
                Analiza el documento para clasificarlo y extraer sus datos. Después podrás
                corregir a mano cualquier campo.
              </p>
              <button
                type="button"
                onClick={() => analyze(selected.id)}
                disabled={analyzing}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40 dark:text-[#0b0b0d]"
              >
                {analyzing ? "Analizando…" : "Analizar documento"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">
                  Datos extraídos
                  {confirmado && (
                    <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                      guardado
                    </span>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => analyze(selected.id)}
                  disabled={analyzing}
                  className="text-xs text-muted underline-offset-2 hover:underline disabled:opacity-40"
                >
                  {analyzing ? "Analizando…" : "Volver a analizar"}
                </button>
              </div>

              <DatosForm
                key={selected.id}
                extraccion={selected.extraction}
                onChange={(siguiente) => {
                  actualizar(selected.id, { extraction: siguiente });
                  setAviso(null);
                }}
                onGuardar={guardar}
                onConfirmar={confirmar}
                guardando={guardando}
                confirmando={confirmando}
                aviso={aviso}
              />
            </div>
          )}
        </div>
      </section>

      <ListaRegistros
        registros={registros}
        seleccionado={selectedId}
        onAbrir={abrirDocumento}
      />

      <Chat hayDocumentos={registros.length > 0} onAbrirDocumento={abrirDocumento} />
    </>
  );
}
