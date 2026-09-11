"use client";

import { useRef, useState } from "react";
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
  "¿Cuánto suman las facturas guardadas?",
  "¿Cuántos documentos hay de cada tipo?",
  "¿Qué dice el contrato sobre la fianza?",
];

/**
 * Convierte las citas [1] en botones que abren el documento y respeta las
 * negritas de markdown que devuelve el modelo.
 */
function conCitas(texto: string, fuentes: Fuente[], onAbrir: (id: string) => void) {
  return texto.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((parte, i) => {
    const negrita = /^\*\*([^*]+)\*\*$/.exec(parte);
    if (negrita) {
      return (
        <strong key={i} className="font-semibold">
          {negrita[1]}
        </strong>
      );
    }

    const cita = /^\[(\d+)\]$/.exec(parte);
    if (!cita) return <span key={i}>{parte}</span>;

    const fuente = fuentes.find((f) => f.n === Number(cita[1]));
    if (!fuente) return <span key={i}>{parte}</span>;

    return (
      <button
        key={i}
        type="button"
        onClick={() => onAbrir(fuente.document_id)}
        title={
          fuente.similitud === undefined
            ? fuente.filename
            : `${fuente.filename} · ${Math.round(fuente.similitud * 100)}% de similitud`
        }
        className="mx-0.5 rounded bg-accent/15 px-1 text-xs font-medium text-accent hover:bg-accent/25"
      >
        {parte}
      </button>
    );
  });
}

export default function Chat({
  hayDocumentos,
  onAbrirDocumento,
}: {
  hayDocumentos: boolean;
  onAbrirDocumento: (documentId: string) => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<HTMLDivElement>(null);

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
      requestAnimationFrame(() => finalRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Preguntar a los documentos</h2>
        <span className="text-xs text-muted">
          busca por significado y cita sus fuentes
        </span>
      </div>

      <div className="rounded-2xl border border-border-soft bg-surface">
        <div className="max-h-[420px] space-y-4 overflow-y-auto p-4">
          {mensajes.length === 0 && (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm text-muted">
                {hayDocumentos
                  ? "Pregunta lo que quieras sobre los documentos guardados."
                  : "Confirma algún documento y podrás preguntarle cosas aquí."}
              </p>
              {hayDocumentos && (
                <div className="flex flex-wrap justify-center gap-2">
                  {EJEMPLOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => preguntar(e)}
                      className="rounded-full border border-border-soft px-3 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mensajes.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="ml-auto max-w-[80%] rounded-2xl bg-accent/10 px-3 py-2 text-sm">
                {m.content}
              </p>
            ) : (
              <div key={i} className="max-w-[85%] space-y-2">
                <p className="whitespace-pre-wrap rounded-2xl bg-foreground/[0.04] px-3 py-2 text-sm leading-relaxed">
                  {conCitas(m.content, m.fuentes ?? [], onAbrirDocumento)}
                </p>

                {m.modo === "sql" && m.sql && (
                  <details className="pl-1">
                    <summary className="cursor-pointer text-xs text-muted hover:text-accent">
                      Respondido con una consulta SQL
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-foreground/[0.04] p-2 font-mono text-[11px] leading-relaxed text-muted">
                      {m.sql}
                    </pre>
                  </details>
                )}

                {m.fuentes && m.fuentes.length > 0 && (
                  <ul className="space-y-1 pl-1">
                    {m.fuentes.map((f) => (
                      <li key={f.n} className="text-xs text-muted">
                        <button
                          type="button"
                          onClick={() => onAbrirDocumento(f.document_id)}
                          className="text-left hover:text-accent"
                          title={f.fragmento}
                        >
                          <span className="font-medium text-accent">[{f.n}]</span>{" "}
                          {ETIQUETA_TIPO[f.tipo_documento as "otro"] ?? f.tipo_documento}
                          {f.numero_documento ? ` ${f.numero_documento}` : ""}
                          {f.emisor_nombre ? ` · ${f.emisor_nombre}` : ""}
                          {f.fecha_emision ? ` · ${f.fecha_emision}` : ""}
                          <span className="opacity-60"> · {f.filename}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}

          {pensando && <p className="text-sm text-muted">Buscando en los documentos…</p>}
          {error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          <div ref={finalRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(pregunta);
          }}
          className="flex gap-2 border-t border-border-soft p-3"
        >
          <input
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder={
              hayDocumentos ? "¿Cuál es el total de la factura de marzo?" : "Sin documentos aún"
            }
            disabled={!hayDocumentos}
            className="flex-1 rounded-lg border border-border-soft bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!hayDocumentos || pensando || pregunta.trim() === ""}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40 dark:text-[#0b0b0d]"
          >
            {pensando ? "…" : "Preguntar"}
          </button>
        </form>
      </div>
    </section>
  );
}
