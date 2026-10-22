"use client";

import { forwardRef, useMemo, useState } from "react";
import { ScanBarcodeIcon } from "lucide-react";
import { toast } from "sonner";
import { Kbd } from "@/components/common/kbd";
import { Badge } from "@/components/ui/badge";
import { buscarArticulos, normalizarCodigo, parsearEntrada, type CoincidenciaCodigo } from "@/domain/codigos";
import { ETIQUETA_UNIDAD, type Articulo, type Milesimas } from "@/domain/types";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  articulos: readonly Articulo[];
  indice: ReadonlyMap<string, CoincidenciaCodigo>;
  onAgregar: (articulo: Articulo, cantidad: Milesimas) => void;
}

/**
 * Campo único para lector de código de barras y búsqueda. Los lectores USB
 * "tipean" el código y mandan Enter. Acepta el atajo "5*código".
 */
export const Buscador = forwardRef<HTMLInputElement, Props>(function Buscador({ articulos, indice, onAgregar }, ref) {
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);

  const entrada = parsearEntrada(texto);
  const termino = entrada?.codigo ?? "";
  const multiplicador = entrada?.multiplicador ?? 1000;
  const hayMultiplicador = /\*/.test(texto);

  const resultados = useMemo(
    () => (termino.length >= 2 ? buscarArticulos(articulos, termino, 8) : []),
    [articulos, termino],
  );

  function agregar(articulo: Articulo, cantidadCodigo: Milesimas) {
    onAgregar(articulo, Math.round((multiplicador * cantidadCodigo) / 1000));
    setTexto("");
    setResaltado(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && resultados.length > 0) {
      e.preventDefault();
      setResaltado((i) => (i + 1) % resultados.length);
    } else if (e.key === "ArrowUp" && resultados.length > 0) {
      e.preventDefault();
      setResaltado((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Escape" && texto) {
      e.stopPropagation();
      setTexto("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!entrada) return;
      const exacto = indice.get(normalizarCodigo(entrada.codigo));
      if (exacto) return agregar(exacto.articulo, exacto.cantidad);
      if (resultados.length > 0) return agregar(resultados[resaltado] ?? resultados[0], 1000);
      toast.error(`No se encontró "${entrada.codigo}"`);
      setTexto("");
    }
  }

  return (
    <div className="relative">
      <div className="flex h-12 items-center gap-2 rounded-xl border-2 border-primary/40 bg-background px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20">
        <ScanBarcodeIcon className="size-5 shrink-0 text-primary" />
        <input
          ref={ref}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setResaltado(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Escaneá un código o buscá por nombre…"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="enter"
          aria-label="Código o búsqueda de artículo"
          role="combobox"
          aria-expanded={resultados.length > 0}
          aria-controls="resultados-busqueda"
        />
        {hayMultiplicador && entrada && (
          <Badge className="shrink-0">× {formatQty(multiplicador)}</Badge>
        )}
        <Kbd className="hidden sm:inline-flex">F2</Kbd>
      </div>

      {resultados.length > 0 && (
        <ul
          id="resultados-busqueda"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {resultados.map((art, i) => (
            <li
              key={art.id}
              role="option"
              aria-selected={i === resaltado}
              onMouseDown={(e) => {
                e.preventDefault(); // conserva el foco en el campo
                agregar(art, 1000);
              }}
              onMouseEnter={() => setResaltado(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                i === resaltado && "bg-accent",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{art.nombre}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {art.codigo} · {art.marca}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular text-sm font-medium">{formatMoney(art.precioNeto)}</p>
                <p className={cn("text-xs", art.stock <= 0 ? "text-destructive" : "text-muted-foreground")}>
                  Stock {formatQty(art.stock)} {ETIQUETA_UNIDAD[art.unidad].corta}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
