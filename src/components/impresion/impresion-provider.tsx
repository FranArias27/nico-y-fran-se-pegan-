"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FormatoImpresion = "a4" | "ticket";

const PAGINA: Record<FormatoImpresion, string> = {
  a4: "@page { size: A4; margin: 12mm; }",
  ticket: "@page { size: 80mm auto; margin: 3mm; }",
};

type Imprimir = (contenido: React.ReactNode, formato: FormatoImpresion) => Promise<void>;

const Contexto = createContext<Imprimir | null>(null);

const esperarFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Espera a que el contenido (QR incluidos) termine de dibujarse antes de imprimir. */
async function esperarContenido(zona: HTMLElement) {
  const limite = Date.now() + 2000;
  await esperarFrame();
  await esperarFrame();
  while (Date.now() < limite) {
    const pendientes =
      zona.querySelector("[data-cargando]") !== null ||
      [...zona.querySelectorAll("img")].some((img) => !img.complete);
    if (!pendientes) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Imprime contenido sin salir de la pantalla actual: lo dibuja en una zona
 * que solo es visible al imprimir y ajusta el tamaño de página.
 */
export function ImpresionProvider({ children }: { children: React.ReactNode }) {
  const [trabajo, setTrabajo] = useState<{ contenido: React.ReactNode; formato: FormatoImpresion } | null>(null);
  const zonaRef = useRef<HTMLDivElement>(null);
  const resolverRef = useRef<(() => void) | null>(null);

  const imprimir = useCallback<Imprimir>((contenido, formato) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
      setTrabajo({ contenido, formato });
    });
  }, []);

  useEffect(() => {
    if (!trabajo || !zonaRef.current) return;
    let cancelado = false;
    const zona = zonaRef.current;

    (async () => {
      await esperarContenido(zona);
      if (cancelado) return;
      document.body.classList.add("imprimiendo");
      const terminar = () => {
        document.body.classList.remove("imprimiendo");
        window.removeEventListener("afterprint", terminar);
        setTrabajo(null);
        resolverRef.current?.();
        resolverRef.current = null;
      };
      window.addEventListener("afterprint", terminar);
      window.print();
      // Algunos navegadores (móviles) no disparan afterprint.
      setTimeout(() => {
        if (document.body.classList.contains("imprimiendo")) terminar();
      }, 1500);
    })();

    return () => {
      cancelado = true;
    };
  }, [trabajo]);

  return (
    <Contexto.Provider value={imprimir}>
      {children}
      {trabajo &&
        createPortal(
          <div id="zona-impresion" ref={zonaRef} data-formato={trabajo.formato}>
            <style>{PAGINA[trabajo.formato]}</style>
            {trabajo.contenido}
          </div>,
          document.body,
        )}
    </Contexto.Provider>
  );
}

export function useImprimir(): Imprimir {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useImprimir debe usarse dentro de <ImpresionProvider>");
  return ctx;
}
