"use client";

import { ETIQUETA_TIPO } from "@/lib/schemas";
import type { Registro } from "@/lib/registros";

function importe(total: string | null, moneda: string | null) {
  if (total === null) return "—";
  const n = Number(total);
  const formateado = Number.isFinite(n)
    ? n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : total;
  return `${formateado}${moneda ? ` ${moneda}` : ""}`;
}

export default function ListaRegistros({
  registros,
  seleccionado,
  onAbrir,
}: {
  registros: Registro[];
  seleccionado: string | null;
  onAbrir: (documentId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Documentos guardados</h2>
        <span className="text-xs text-muted">
          {registros.length === 0
            ? "ninguno todavía"
            : `${registros.length} ${registros.length === 1 ? "documento" : "documentos"}`}
        </span>
      </div>

      {registros.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-soft px-4 py-6 text-center text-sm text-muted">
          Cuando confirmes un documento aparecerá aquí, con sus datos en tablas y su
          texto indexado en pgvector.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-soft bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr className="border-b border-border-soft">
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Emisor</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Líneas</th>
                <th className="px-4 py-2 text-right font-medium">Chunks</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onAbrir(r.document_id)}
                  className={`cursor-pointer border-b border-border-soft/60 transition last:border-0 hover:bg-foreground/[0.04] ${
                    seleccionado === r.document_id ? "bg-accent/[0.07]" : ""
                  }`}
                  title={r.filename}
                >
                  <td className="px-4 py-2">
                    {ETIQUETA_TIPO[r.tipo_documento as "otro"] ?? r.tipo_documento}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.numero_documento ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.fecha_emision ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-4 py-2">{r.emisor_nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {importe(r.total, r.moneda)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{r.lineas}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{r.chunks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
