"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { Money } from "@/components/common/money";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { armarNotaCredito, pendientesDeDevolver } from "@/domain/nota-credito";
import { ETIQUETA_MEDIO_PAGO, ETIQUETA_UNIDAD, type Cliente, type MedioPago, type Venta } from "@/domain/types";
import { formatQty, parseQty } from "@/lib/format";
import { ErrorDeNegocio } from "@/services";

const MEDIOS_REINTEGRO: MedioPago[] = ["efectivo", "transferencia", "debito", "credito", "cuenta_corriente"];

function reintegroSugerido(venta: Venta, cliente: Cliente | undefined): MedioPago {
  if (cliente?.cuentaCorriente && venta.pagos.some((p) => p.medio === "cuenta_corriente")) return "cuenta_corriente";
  const medio = venta.pagos.find((p) => p.medio !== "cuenta_corriente")?.medio;
  return medio && MEDIOS_REINTEGRO.includes(medio) ? medio : "efectivo";
}

export function NotaCreditoDialog({
  venta,
  notas,
  cliente,
  abierto,
  onAbierto,
}: {
  venta: Venta;
  /** Notas de crédito ya emitidas sobre esta venta. */
  notas: Venta[];
  cliente: Cliente | undefined;
  abierto: boolean;
  onAbierto: (abierto: boolean) => void;
}) {
  const servicios = useServicios();
  const { usuario } = useAuth();
  const router = useRouter();
  const pendientes = pendientesDeDevolver(venta, notas);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(venta.lineas.map((l) => [l.articuloId, formatQty(pendientes.get(l.articuloId) ?? 0)])),
  );
  const [reintegro, setReintegro] = useState<MedioPago>(() => reintegroSugerido(venta, cliente));
  const [reponerStock, setReponerStock] = useState(true);
  const [emitiendo, setEmitiendo] = useState(false);

  const devoluciones = venta.lineas.map((l) => ({
    articuloId: l.articuloId,
    cantidad: parseQty(cantidades[l.articuloId] ?? "") ?? 0,
  }));
  const vista = armarNotaCredito(venta, devoluciones, notas);
  const medios = MEDIOS_REINTEGRO.filter((m) => m !== "cuenta_corriente" || cliente?.cuentaCorriente);

  async function emitir() {
    setEmitiendo(true);
    try {
      const nota = await servicios.ventas.emitirNotaCredito({
        ventaId: venta.id,
        devoluciones,
        reintegro,
        reponerStock,
        vendedorId: usuario.id,
        vendedorNombre: usuario.nombre,
      });
      toast.success("Nota de crédito emitida");
      onAbierto(false);
      router.push(`/comprobantes/${nota.id}`);
    } catch (e) {
      toast.error(e instanceof ErrorDeNegocio ? e.message : "No se pudo emitir la nota de crédito");
      if (!(e instanceof ErrorDeNegocio)) console.error(e);
    } finally {
      setEmitiendo(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !emitiendo && onAbierto(a)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{venta.tipo === "X" ? "Registrar devolución" : "Emitir nota de crédito"}</DialogTitle>
          <DialogDescription>
            Indicá cuánto devuelve el cliente de cada artículo. Para anular la venta completa, dejá las cantidades
            como están.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {venta.lineas.map((l) => {
            const pendiente = pendientes.get(l.articuloId) ?? 0;
            return (
              <div key={l.articuloId} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{l.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    Vendido {formatQty(l.cantidad)} {ETIQUETA_UNIDAD[l.unidad].corta}
                    {pendiente < l.cantidad && ` · ya devuelto ${formatQty(l.cantidad - pendiente)}`}
                  </p>
                </div>
                <Input
                  aria-label={`Cantidad a devolver de ${l.descripcion}`}
                  inputMode="decimal"
                  className="w-24 text-right"
                  value={cantidades[l.articuloId] ?? ""}
                  disabled={pendiente <= 0}
                  onChange={(e) => setCantidades({ ...cantidades, [l.articuloId]: e.target.value })}
                />
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="reintegro">Devolución del dinero</Label>
            <Select value={reintegro} onValueChange={(v) => setReintegro(v as MedioPago)}>
              <SelectTrigger id="reintegro" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {medios.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "cuenta_corriente" ? "Acreditar en la cuenta corriente" : ETIQUETA_MEDIO_PAGO[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="reponer" className="font-normal">
              Vuelve al stock
              <span className="block text-xs text-muted-foreground">Desactivalo si está roto o vencido.</span>
            </Label>
            <Switch id="reponer" checked={reponerStock} onCheckedChange={setReponerStock} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
          <span className="text-sm">Total a acreditar</span>
          {"error" in vista ? (
            <span className="text-sm text-destructive">{vista.error}</span>
          ) : (
            <Money value={vista.totales.total} className="text-xl font-bold" />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onAbierto(false)} disabled={emitiendo}>
            Cancelar
          </Button>
          <Button onClick={() => void emitir()} disabled={emitiendo || "error" in vista}>
            {emitiendo ? (
              <>
                <Loader2Icon className="animate-spin" /> {venta.tipo === "X" ? "Registrando…" : "Solicitando CAE…"}
              </>
            ) : venta.tipo === "X" ? (
              "Registrar devolución"
            ) : (
              "Emitir nota de crédito"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
