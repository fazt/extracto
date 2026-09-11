"use client";

import { useEffect, useRef, useState } from "react";
import { IconoAviso, IconoEnviar, IconoQuitar } from "./iconos";
import { ETIQUETA_TIPO } from "@/lib/schemas";

export type Fuente = {
  n: number;
  document_id: string;
  filename: string;
  tipo_documento: string;
  numero_documento: string | null;
  fecha_emision: string | null;
  emisor_nombre: string | null;
  similitud?: number;
  fragmento?: string;
};

type Mensaje = {
  role: "user" | "assistant";
  content: string;
  fuentes?: Fuente[];
  modo?: "sql" | "semantica";
  sql?: string;
};

const EJEMPLOS = [
  "¿Cuánto suman las facturas?",
  "¿Cuántos documentos hay de cada tipo?",
  "¿Qué dice el contrato sobre la fianza?",
];

/** Las citas [1] se vuelven botones que abren el documento; las negritas del modelo se respetan. */
function conCitas(texto: string, fuentes: Fuente[], onAbrir: (id: string) => void) {
  return texto.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((parte, i) => {
    const negrita = /^\*\*([^*]+)\*\*$/.exec(parte);
    if (negrita) {
      return (
        <strong key={i} className="cifra font-semibold">
          {negrita[1]}
        </strong>
      );
    }

    const cita = /^\[(\d+)\]$/.exec(parte);
    const fuente = cita ? fuentes.find((f) => f.n === Number(cita[1])) : undefined;
    if (!fuente) return <span key={i}>{parte}</span>;

    return (
      <button
        key={i}
        type="button"
        onClick={() => onAbrir(fuente.document_id)}
        title={`${fuente.filename}${
          fuente.similitud === undefined
            ? ""
            : ` · ${Math.round(fuente.similitud * 100)}% de similitud`
        }`}
        className="mx-0.5 rounded bg-accent-soft px-1 align-baseline text-[11px] font-medium text-accent transition hover:bg-accent/15"
      >
        {parte}
      </button>
    );
  });
}

export default function Chat({
  abierto,
  onCerrar,
  hayDocumentos,
  onAbrirDocumento,
}: {
  abierto: boolean;
  onCerrar: () => void;
  hayDocumentos: boolean;
  onAbrirDocumento: (documentId: string) => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) campoRef.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const escape = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [abierto, onCerrar]);

  useEffect(() => {
    finalRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  const preguntar = async (texto: string) => {
    const limpia = texto.trim();
    if (limpia === "" || pensando) return;

    setError(null);
    setPregunta("");
    const historial = mensajes.map(({ role, content }) => ({ role, content }));
    setMensajes((prev) => [...prev, { role: "user", content: limpia }]);
    setPensando(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: limpia, historial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo responder");

      setMensajes((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.respuesta,
          fuentes: data.fuentes ?? [],
          modo: data.modo,
          sql: data.sql,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setPensando(false);
    }
  };

  return (
    <>
      {/* Velo: apaga la aplicación sin ocultarla, y cerrar es pulsar fuera. */}
      <div
        onClick={onCerrar}
        aria-hidden={!abierto}
        className={`fixed inset-0 z-30 bg-ink/10 transition-opacity duration-300 ${
          abierto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Preguntar a tus documentos"
        aria-hidden={!abierto}
        className={`fixed right-0 top-0 z-40 flex h-dvh w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-[-8px_0_32px_-12px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          abierto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <h2 className="text-[13px] font-medium">Preguntar a tus documentos</h2>
          <span className="text-[12px] text-label">
            responde citando la fuente
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="ml-auto rounded-md p-1 text-label transition hover:bg-sunken hover:text-ink"
          >
            <IconoQuitar />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mensajes.length === 0 && (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {hayDocumentos
                  ? "Los cálculos se resuelven con una consulta SQL sobre tus tablas; lo que va del contenido, buscando por significado en el texto indexado."
                  : "Archiva un documento y podrás preguntarle cosas: aquí sólo entra lo confirmado."}
              </p>
              {hayDocumentos && (
                <div className="flex flex-col items-start gap-1.5">
                  {EJEMPLOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => preguntar(e)}
                      className="rounded-md border border-line px-2.5 py-1.5 text-left text-[13px] text-ink-soft transition hover:border-line-strong hover:bg-sunken"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {mensajes.map((m, i) =>
              m.role === "user" ? (
                <p
                  key={i}
                  className="ml-auto w-fit max-w-[85%] rounded-lg bg-sunken px-3 py-1.5 text-[13px]"
                >
                  {m.content}
                </p>
              ) : (
                <div key={i} className="space-y-2">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                    {conCitas(m.content, m.fuentes ?? [], onAbrirDocumento)}
                  </p>

                  {m.fuentes && m.fuentes.length > 0 && (
                    <ul className="space-y-0.5 border-l border-line pl-2.5">
                      {m.fuentes.map((f) => (
                        <li key={f.n}>
                          <button
                            type="button"
                            onClick={() => onAbrirDocumento(f.document_id)}
                            className="text-left text-[12px] leading-relaxed text-label transition hover:text-accent"
                            title={f.fragmento}
                          >
                            <span className="font-medium text-accent">[{f.n}]</span>{" "}
                            {ETIQUETA_TIPO[f.tipo_documento as "otro"] ?? f.tipo_documento}
                            {f.numero_documento ? ` ${f.numero_documento}` : ""}
                            {f.emisor_nombre ? ` · ${f.emisor_nombre}` : ""}
                            <span className="opacity-70"> · {f.filename}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {m.modo === "sql" && m.sql && (
                    <details className="text-[12px]">
                      <summary className="cursor-pointer text-label transition hover:text-ink">
                        Respondido con una consulta SQL
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded-md bg-sunken px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
                        {m.sql}
                      </pre>
                    </details>
                  )}
                </div>
              ),
            )}

            {pensando && <p className="text-[13px] text-label">Buscando en tus documentos…</p>}
            {error && (
              <p className="flex items-start gap-1.5 text-[13px] text-danger">
                <IconoAviso className="mt-0.5 h-3.5 w-3.5" />
                {error}
              </p>
            )}
            <div ref={finalRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(pregunta);
          }}
          className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3"
        >
          <input
            ref={campoRef}
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            disabled={!hayDocumentos}
            placeholder={
              hayDocumentos ? "Escribe tu pregunta…" : "Aún no hay nada archivado"
            }
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none transition placeholder:text-label hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!hayDocumentos || pensando || pregunta.trim() === ""}
            aria-label="Preguntar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white transition hover:bg-[#4338ca] disabled:opacity-30"
          >
            <IconoEnviar className="h-3.5 w-3.5" />
          </button>
        </form>
      </aside>
    </>
  );
}
