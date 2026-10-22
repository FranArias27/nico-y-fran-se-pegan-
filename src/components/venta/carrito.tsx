"use client";

import { useState } from "react";
import { AlertTriangleIcon, ScanBarcodeIcon, Trash2Icon } from "lucide-react";
import { DescuentoEditor } from "@/components/common/descuento-editor";
import { Button } from "@/components/ui/button";
import { ETIQUETA_UNIDAD, type Articulo, type Descuento, type LineaVenta, type Milesimas } from "@/domain/types";
import { formatMoney, formatQty, parseQty } from "@/lib/format";
import { cn } from "@/lib/utils";

function CantidadInput({
  cantidad,
  unidad,
  onCambio,
  onListo,
}: {
  cantidad: Milesimas;
  unidad: Articulo["unidad"];
  onCambio: (c: Milesimas) => void;
  onListo: () => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);

  function confirmar() {
    if (texto === null) return;
    const valor = parseQty(texto);
    // Las unidades enteras no aceptan decimales.
    if (valor !== null && valor > 0) onCambio(unidad === "unidad" ? Math.max(1000, Math.round(valor / 1000) * 1000) : valor);
    setTexto(null);
  }

  return (
    <input
      value={texto ?? formatQty(cantidad)}
      onFocus={(e) => {
        setTexto(formatQty(cantidad));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar();
          onListo();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setTexto(null);
          onListo();
        }
      }}
      inputMode="decimal"
      aria-label="Cantidad"
      className="tabular h-8 w-20 rounded-md border bg-background px-2 text-right text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
    />
  );
}

interface Props {
  lineas: LineaVenta[];
  articulos: ReadonlyMap<string, Articulo>;
  ultimoArticuloId?: string;
  puedeDescontar: boolean;
  onCantidad: (articuloId: string, cantidad: Milesimas) => void;
  onDescuento: (articuloId: string, descuento: Descuento | undefined) => void;
  onQuitar: (articuloId: string) => void;
  onListo: () => void;
}

export function Carrito({
  lineas,
  articulos,
  ultimoArticuloId,
  puedeDescontar,
  onCantidad,
  onDescuento,
  onQuitar,
  onListo,
}: Props) {
  if (lineas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <ScanBarcodeIcon className="size-10 opacity-40" />
        <p className="font-medium text-foreground">Todavía no hay artículos</p>
        <p className="max-w-sm text-sm">
          Escaneá con el lector o escribí el nombre. Para varias unidades, escribí la cantidad y un asterisco antes
          del código: <span className="font-mono">5*</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden rounded-xl border bg-card">
      <div className="hidden grid-cols-[1fr_6rem_7rem_5.5rem_7.5rem_2.5rem] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Artículo</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Precio neto</span>
        <span className="text-right">Desc.</span>
        <span className="text-right">Subtotal neto</span>
        <span />
      </div>
      <ul className="divide-y">
        {lineas.map((l) => {
          const art = articulos.get(l.articuloId);
          const sinStock = art ? art.stock - l.cantidad < 0 : false;
          return (
            <li
              key={l.articuloId}
              className={cn(
                "grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1fr_6rem_7rem_5.5rem_7.5rem_2.5rem]",
                l.articuloId === ultimoArticuloId && "animate-in bg-primary/5 fade-in",
              )}
            >
              <div className="col-span-4 min-w-0 md:col-span-1">
                <p className="truncate font-medium">{l.descripcion}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{l.codigo}</span>
                  {art && (
                    <span className={cn(sinStock && "font-medium text-amber-700 dark:text-amber-400")}>
                      {sinStock && <AlertTriangleIcon className="mr-0.5 inline size-3" />}
                      Stock {formatQty(art.stock)} {ETIQUETA_UNIDAD[art.unidad].corta}
                      {sinStock && " · queda negativo"}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 md:justify-end">
                <CantidadInput
                  key={l.cantidad}
                  cantidad={l.cantidad}
                  unidad={l.unidad}
                  onCambio={(c) => onCantidad(l.articuloId, c)}
                  onListo={onListo}
                />
                <span className="w-6 text-xs text-muted-foreground">{ETIQUETA_UNIDAD[l.unidad].corta}</span>
              </div>
              <span className="tabular hidden text-right text-sm md:block">{formatMoney(l.precioNeto)}</span>
              <div className="flex justify-end">
                {puedeDescontar ? (
                  <DescuentoEditor
                    compacto
                    valor={l.descuento}
                    onCambio={(d) => onDescuento(l.articuloId, d)}
                    etiqueta="Descuento del ítem"
                  />
                ) : (
                  <span className="hidden text-sm text-muted-foreground md:inline">—</span>
                )}
              </div>
              <div className="text-right">
                <p className="tabular font-semibold">{formatMoney(l.neto)}</p>
                {l.descuentoNeto > 0 && (
                  <p className="tabular text-xs text-muted-foreground line-through">{formatMoney(l.netoBruto)}</p>
                )}
                <p className="tabular text-xs text-muted-foreground md:hidden">{formatMoney(l.precioNeto)} c/u</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onQuitar(l.articuloId)}
                aria-label={`Quitar ${l.descripcion}`}
                className="justify-self-end text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
