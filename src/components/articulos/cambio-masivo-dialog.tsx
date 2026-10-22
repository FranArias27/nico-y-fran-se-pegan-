"use client";

import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previsualizarCambioCostos } from "@/domain/precios";
import type { Articulo, Categoria } from "@/domain/types";
import { formatMoney, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CambioMasivoDialog({
  abierto,
  onAbierto,
  categorias,
  articulos,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  categorias: Categoria[];
  articulos: Articulo[];
}) {
  const servicios = useServicios();
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [sentido, setSentido] = useState<"subir" | "bajar">("subir");
  const [texto, setTexto] = useState("10");
  const [aplicando, setAplicando] = useState(false);

  const porcentaje = parseMoney(texto) ?? 0; // en puntos básicos
  const variacion = sentido === "subir" ? porcentaje : -porcentaje;
  const deCategoria = articulos.filter((a) => a.categoriaId === categoriaId && a.activo);
  const vista = previsualizarCambioCostos(deCategoria, variacion);
  const nombres = new Map(deCategoria.map((a) => [a.id, a.nombre]));

  async function aplicar() {
    setAplicando(true);
    try {
      const n = await servicios.articulos.aplicarCambioMasivo(categoriaId, variacion);
      toast.success(`Se actualizaron ${n} artículos`);
      onAbierto(false);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Modificación masiva de costos</DialogTitle>
          <DialogDescription>
            Sube o baja el costo de toda una categoría. Cada artículo mantiene su % de ganancia y se recalcula el precio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_8rem]">
          <div className="grid gap-1.5">
            <Label>Categoría</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Variación</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["subir", "bajar"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentido(s)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium",
                    sentido === s ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {s === "subir" ? "Aumento" : "Rebaja"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pct">Porcentaje</Label>
            <div className="relative">
              <Input id="pct" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} className="tabular pr-7 text-right" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="max-h-[45dvh] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Artículo</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Precio final</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vista.map((c) => (
                <tr key={c.articuloId}>
                  <td className="px-3 py-2">{nombres.get(c.articuloId)}</td>
                  <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                    <span className="text-muted-foreground">{formatMoney(c.costoAnterior)}</span>
                    <ArrowRightIcon className="mx-1 inline size-3 text-muted-foreground" />
                    {formatMoney(c.costoNuevo)}
                  </td>
                  <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                    <span className="text-muted-foreground">{formatMoney(c.precioFinalAnterior)}</span>
                    <ArrowRightIcon className="mx-1 inline size-3 text-muted-foreground" />
                    <span className="font-semibold">{formatMoney(c.precioFinalNuevo)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={aplicando || porcentaje <= 0 || vista.length === 0}>
            Aplicar a {vista.length} artículos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
