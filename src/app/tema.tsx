"use client";

import { useSyncExternalStore } from "react";
import { IconoLuna, IconoSol } from "./iconos";

const EVENTO = "extracto:tema";

/** El tema vive en el documento, no en React: el script del layout lo fija antes del primer pintado. */
function suscribir(alCambiar: () => void) {
  window.addEventListener(EVENTO, alCambiar);
  return () => window.removeEventListener(EVENTO, alCambiar);
}

const leer = () => document.documentElement.dataset.theme ?? "light";
const leerEnServidor = () => "light";

export default function ConmutadorTema() {
  const tema = useSyncExternalStore(suscribir, leer, leerEnServidor);
  const oscuro = tema === "dark";

  const cambiar = () => {
    const siguiente = oscuro ? "light" : "dark";
    document.documentElement.dataset.theme = siguiente;
    try {
      localStorage.setItem("extracto:tema", siguiente);
    } catch {
      // Modo privado o almacenamiento bloqueado: el tema dura la sesión.
    }
    window.dispatchEvent(new Event(EVENTO));
  };

  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={oscuro ? "Tema claro" : "Tema oscuro"}
      className="rounded-lg border border-line p-1.5 text-label transition hover:border-line-strong hover:bg-sunken hover:text-ink"
    >
      {oscuro ? <IconoSol className="h-3.5 w-3.5" /> : <IconoLuna className="h-3.5 w-3.5" />}
    </button>
  );
}
