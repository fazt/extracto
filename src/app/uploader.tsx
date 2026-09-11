"use client";

import { useCallback, useEffect, useState } from "react";
import Chat from "./chat";
import DatosForm from "./datos-form";
import ListaRegistros from "./lista-registros";
import SelectorDocumento from "./selector-documento";
import SubirModal from "./subir-modal";
import ConmutadorTema from "./tema";
import {
  IconoArchivo,
  IconoAviso,
  IconoConforme,
  IconoPregunta,
  IconoRecargar,
  IconoSubir,
} from "./iconos";
import type { Extraccion } from "@/lib/schemas";
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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
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
  const [vista, setVista] = useState<"revisar" | "archivo">("revisar");
  // En móvil no caben documento e inspector a la vez: se conmuta entre ellos.
  const [panelMovil, setPanelMovil] = useState<"documento" | "datos">("documento");
  const [subirAbierto, setSubirAbierto] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(dbError);

  const selected = docs.find((d) => d.id === selectedId) ?? null;
  const archivados = new Set(registros.map((r) => r.document_id));
  const confirmado = selectedId !== null && archivados.has(selectedId);

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
    setVista("revisar");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir el archivo");
      const doc: Doc = { ...data, doc_type: null, extraction: null };
      setDocs((prev) => [doc, ...prev]);
      setSelectedId(doc.id);
      setPanelMovil("documento");
      setSubirAbierto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setSubirAbierto(false);
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
        if (!res.ok) throw new Error(data.error ?? "No se pudo analizar el documento");
        actualizar(id, { doc_type: data.doc_type, extraction: data.extraction });
        setPanelMovil("datos");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setAnalyzing(false);
      }
    },
    [actualizar],
  );

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
        `Archivado · ${data.lineas} ${data.lineas === 1 ? "línea" : "líneas"} y ${data.chunks} ${
          data.chunks === 1 ? "fragmento indexado" : "fragmentos indexados"
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setConfirmando(false);
    }
  }, [selected, actualizar, guardarBorrador, refrescarRegistros]);

  const abrirDocumento = useCallback((documentId: string) => {
    setSelectedId(documentId);
    setVista("revisar");
    setPanelMovil("documento");
    setAviso(null);
  }, []);

  // Arrastrar sobre cualquier punto de la ventana: el objetivo es la aplicación entera.
  useEffect(() => {
    const sobre = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const fuera = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const soltar = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) upload(file);
    };
    window.addEventListener("dragover", sobre);
    window.addEventListener("dragleave", fuera);
    window.addEventListener("drop", soltar);
    return () => {
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("dragleave", fuera);
      window.removeEventListener("drop", soltar);
    };
  }, [upload]);

  const botonBarra =
    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <span className="font-marca text-[17px] font-semibold tracking-[-0.01em]">
          Extracto
        </span>
        <span className="hidden text-[12px] text-label sm:inline">
          facturas, recibos y contratos revisados por ti
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => setVista(vista === "archivo" ? "revisar" : "archivo")}
            aria-pressed={vista === "archivo"}
            className={`${botonBarra} ${
              vista === "archivo"
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-line text-ink-soft hover:border-line-strong hover:bg-sunken"
            }`}
          >
            <IconoArchivo className="h-3.5 w-3.5" />
            Archivo
            <span className="cifra text-label">{registros.length}</span>
          </button>

          <button
            onClick={() => setChatAbierto(true)}
            className={`${botonBarra} border-line text-ink-soft hover:border-line-strong hover:bg-sunken`}
          >
            <IconoPregunta className="h-3.5 w-3.5" />
            Preguntar
          </button>

          <ConmutadorTema />

          <button
            onClick={() => setSubirAbierto(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            <IconoSubir className="h-3.5 w-3.5" />
            Subir
          </button>
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-start gap-2 border-b border-danger/25 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          <IconoAviso className="mt-0.5 h-3.5 w-3.5" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="underline-offset-2 hover:underline">
            Descartar
          </button>
        </div>
      )}

      {vista === "archivo" ? (
        <div className="flex-1 overflow-y-auto">
          <ListaRegistros
            registros={registros}
            seleccionado={selectedId}
            onAbrir={abrirDocumento}
          />
        </div>
      ) : (
        <>
          {selected && (
            <div className="flex shrink-0 border-b border-line bg-surface lg:hidden">
              {(
                [
                  ["documento", "Documento"],
                  ["datos", "Datos extraídos"],
                ] as const
              ).map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  onClick={() => setPanelMovil(clave)}
                  aria-current={panelMovil === clave}
                  className={`flex-1 border-b-2 px-3 py-2 text-[13px] transition ${
                    panelMovil === clave
                      ? "border-accent text-accent"
                      : "border-transparent text-label hover:text-ink"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            {/* Documento */}
            <section
              className={`min-h-0 flex-col border-b border-line lg:flex lg:border-b-0 lg:border-r ${
                panelMovil === "documento" || !selected ? "flex" : "hidden"
              }`}
            >
              {selected ? (
                <>
                  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5 text-[13px]">
                    <SelectorDocumento
                      docs={docs}
                      selected={selected}
                      archivados={archivados}
                      onElegir={abrirDocumento}
                    />
                    <span className="cifra shrink-0 text-label">
                      {formatSize(Number(selected.size_bytes))}
                    </span>
                    {confirmado && (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-ok">
                        <IconoConforme className="h-3.5 w-3.5" />
                        Archivado
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto bg-sunken p-4">
                    {selected.mime_type === "application/pdf" ? (
                      <object
                        data={`/api/files/${selected.id}`}
                        type="application/pdf"
                        className="h-full min-h-[70vh] w-full rounded-lg border border-line bg-white"
                      >
                        <p className="p-6 text-[13px] text-ink-soft">
                          Tu navegador no puede mostrar el PDF.{" "}
                          <a className="text-accent underline" href={`/api/files/${selected.id}`}>
                            Ábrelo en una pestaña
                          </a>
                        </p>
                      </object>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${selected.id}`}
                        alt={selected.filename}
                        className="mx-auto w-auto max-w-full rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                      />
                    )}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setSubirAbierto(true)}
                  className="flex flex-1 flex-col items-center justify-center gap-3 bg-sunken p-8 text-center transition hover:bg-[color-mix(in_oklab,var(--sunken)_92%,var(--ink))]"
                >
                  <IconoSubir className="h-6 w-6 text-label" />
                  <span className="text-[15px] font-medium">
                    Sube tu primer documento
                  </span>
                  <span className="max-w-sm text-[13px] text-label">
                    Una factura, un recibo o un contrato. Lo leo, lo clasifico y te dejo
                    corregir lo que haga falta antes de archivarlo.
                  </span>
                </button>
              )}
            </section>

            {/* Datos */}
            <section
              className={`min-h-0 flex-col bg-surface lg:flex ${
                panelMovil === "datos" && selected ? "flex" : "hidden lg:flex"
              }`}
            >
              {!selected ? (
                <p className="flex flex-1 items-center justify-center px-8 text-center text-[13px] text-label">
                  Los datos del documento aparecerán aquí para que los revises.
                </p>
              ) : !selected.extraction ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
                  <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">
                    {analyzing
                      ? "Leyendo el documento, clasificándolo y transcribiendo su texto. Tarda entre 10 y 20 segundos."
                      : "Analiza el documento para extraer sus campos. Después podrás corregir lo que haga falta antes de archivarlo."}
                  </p>
                  <button
                    onClick={() => analyze(selected.id)}
                    disabled={analyzing}
                    className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {analyzing ? "Analizando…" : "Analizar documento"}
                  </button>
                </div>
              ) : (
                <div className="entra flex min-h-0 flex-1 flex-col">
                  <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
                    <h2 className="text-[13px] font-medium">Datos extraídos</h2>
                    <button
                      onClick={() => analyze(selected.id)}
                      disabled={analyzing}
                      className="ml-auto flex items-center gap-1.5 text-[13px] text-label transition hover:text-ink disabled:opacity-50"
                    >
                      <IconoRecargar className="h-3.5 w-3.5" />
                      {analyzing ? "Analizando…" : "Volver a analizar"}
                    </button>
                  </div>

                  <DatosForm
                    key={selected.id}
                    extraccion={selected.extraction}
                    confirmado={confirmado}
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
            </section>
          </div>
        </>
      )}

      <Chat
        abierto={chatAbierto}
        onCerrar={() => setChatAbierto(false)}
        hayDocumentos={registros.length > 0}
        onAbrirDocumento={(id) => {
          abrirDocumento(id);
          setChatAbierto(false);
        }}
      />

      {subirAbierto && (
        <SubirModal
          subiendo={uploading}
          onCerrar={() => setSubirAbierto(false)}
          onArchivo={upload}
        />
      )}

      {dragging && !subirAbierto && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/5 backdrop-blur-[1px]">
          <div className="rounded-xl border-2 border-dashed border-accent bg-surface px-6 py-4 text-[13px] font-medium text-accent">
            Suelta el documento para subirlo
          </div>
        </div>
      )}
    </div>
  );
}
