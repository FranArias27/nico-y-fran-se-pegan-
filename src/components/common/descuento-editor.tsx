"use client";

import { useState } from "react";
import { PercentIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Descuento } from "@/domain/types";
import { formatMoney, formatPercent, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function describirDescuento(d: Descuento): string {
  return d.tipo === "porcentaje" ? formatPercent(d.valor / 100) : formatMoney(d.valor);
}

/** Popover para cargar un descuento en % o en monto (sobre el neto). */
export function DescuentoEditor({
  valor,
  onCambio,
  etiqueta = "Descuento",
  compacto = false,
}: {
  valor: Descuento | undefined;
  onCambio: (d: Descuento | undefined) => void;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Descuento["tipo"]>(valor?.tipo ?? "porcentaje");
  const [texto, setTexto] = useState("");

  function abrir(abrirlo: boolean) {
    if (abrirlo) {
      setTipo(valor?.tipo ?? "porcentaje");
      // Puntos básicos y centavos tienen ambos 2 decimales.
      setTexto(valor ? String(valor.valor / 100).replace(".", ",") : "");
    }
    setAbierto(abrirlo);
  }

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    const centesimos = parseMoney(texto); // ambos tipos se guardan con 2 decimales
    if (centesimos === null || centesimos <= 0) {
      onCambio(undefined);
    } else if (tipo === "porcentaje") {
      onCambio({ tipo, valor: Math.min(centesimos, 10000) });
    } else {
      onCambio({ tipo, valor: centesimos });
    }
    setAbierto(false);
  }

  return (
    <Popover open={abierto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <Button
          variant={valor ? "secondary" : "ghost"}
          size={compacto ? "xs" : "sm"}
          className={cn(valor && "text-primary")}
          aria-label={etiqueta}
        >
          {valor ? describirDescuento(valor) : compacto ? <PercentIcon /> : (
            <>
              <PercentIcon /> {etiqueta}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <form onSubmit={aplicar} className="grid gap-3">
          <Label>{etiqueta} (sobre el neto)</Label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["porcentaje", "monto"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  "rounded-md px-2 py-1 text-sm font-medium",
                  tipo === t ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "porcentaje" ? "%" : "$"}
              </button>
            ))}
          </div>
          <Input
            autoFocus
            inputMode="decimal"
            placeholder={tipo === "porcentaje" ? "10" : "1.000,00"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onCambio(undefined);
                setAbierto(false);
              }}
            >
              Quitar
            </Button>
            <Button type="submit" size="sm">
              Aplicar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
