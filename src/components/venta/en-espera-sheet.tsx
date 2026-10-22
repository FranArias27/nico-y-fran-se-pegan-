"use client";

import { ClockIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { VentaEnEspera } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export function EnEsperaSheet({
  abierto,
  onAbierto,
  ventas,
  onRetomar,
  onDescartar,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  ventas: readonly VentaEnEspera[];
  onRetomar: (id: string) => void;
  onDescartar: (id: string) => void;
}) {
  return (
    <Sheet open={abierto} onOpenChange={onAbierto}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Ventas en espera</SheetTitle>
          <SheetDescription>
            Retomá una venta para seguir cargándola. Si hay una venta en curso, queda en espera.
          </SheetDescription>
        </SheetHeader>
        <ul className="grid gap-2 overflow-y-auto px-4 pb-4">
          {ventas.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en espera.</p>}
          {ventas.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-xl border p-3">
              <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.etiqueta}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(v.creadaEn)} · {v.items.length} {v.items.length === 1 ? "artículo" : "artículos"}
                </p>
              </div>
              <Button size="sm" onClick={() => onRetomar(v.id)}>
                <PlayIcon /> Retomar
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Descartar"
                onClick={() => onDescartar(v.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
