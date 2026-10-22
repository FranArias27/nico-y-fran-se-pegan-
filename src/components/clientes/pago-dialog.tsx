"use client";

import { useState } from "react";
import { CheckCircle2Icon, PrinterIcon, ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { Money } from "@/components/common/money";
import { useImprimir, type FormatoImpresion } from "@/components/impresion/impresion-provider";
import { ReciboDocumento } from "@/components/impresion/recibo-documento";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEDIOS_PAGO_CUENTA } from "@/domain/cobro";
import { diasVencido, imputarAutomatico, imputarSeleccion } from "@/domain/cuenta-corriente";
import { aFechaISO } from "@/domain/fechas";
import { ETIQUETA_MEDIO_PAGO, type MedioPago, type Recibo } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatAmount, formatDate, formatMoney, formatNumeroComprobante, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorDeNegocio } from "@/services";
import type { CuentaCliente } from "@/services/cuenta-corriente";

function ReciboEmitido({ recibo, saldoRestante, onCerrar }: { recibo: Recibo; saldoRestante: number; onCerrar: () => void }) {
  const imprimir = useImprimir();
  const { datos: comercio } = useConsulta((s) => s.demo.obtenerComercio());

  function imprimirEn(formato: FormatoImpresion) {
    if (!comercio) return;
    void imprimir(<ReciboDocumento recibo={recibo} comercio={comercio} saldoRestante={saldoRestante} formato={formato} />, formato);
  }

  return (
    <div className="grid gap-4">
      <DialogHeader className="items-center text-center">
        <CheckCircle2Icon className="size-12 text-emerald-600" />
        <DialogTitle className="text-xl">Pago registrado</DialogTitle>
        <DialogDescription>
          Recibo {formatNumeroComprobante(recibo.puntoVenta, recibo.numero)} · {recibo.clienteNombre}
        </DialogDescription>
      </DialogHeader>
      <div className="text-center">
        <Money value={recibo.importe} className="text-3xl font-bold" />
        <p className="mt-1 text-sm text-muted-foreground">
          {saldoRestante > 0
            ? `Queda un saldo de ${formatMoney(saldoRestante)}`
            : saldoRestante < 0
              ? `Saldo a favor: ${formatMoney(-saldoRestante)}`
              : "La cuenta quedó saldada"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => imprimirEn("ticket")}>
          <ReceiptIcon /> Ticket 80 mm
        </Button>
        <Button variant="outline" onClick={() => imprimirEn("a4")}>
          <PrinterIcon /> Hoja A4
        </Button>
      </div>
      <DialogFooter>
        <Button className="w-full" onClick={onCerrar} autoFocus>
          Listo
        </Button>
      </DialogFooter>
    </div>
  );
}

function FormPago({ cuenta, onRegistrado }: { cuenta: CuentaCliente; onRegistrado: (r: Recibo, saldo: number) => void }) {
  const servicios = useServicios();
  const { usuario } = useAuth();
  const { resumen, cliente } = cuenta;
  const hoy = aFechaISO(servicios.ahora());
  const [texto, setTexto] = useState(formatAmount(Math.max(resumen.saldo, 0)));
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [modo, setModo] = useState<"automatica" | "manual">("automatica");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const importe = parseMoney(texto) ?? 0;
  const vista =
    modo === "automatica" ? imputarAutomatico(resumen.deudas, importe) : imputarSeleccion(resumen.deudas, elegidos, importe);
  const aplicado = new Map(vista.imputaciones.map((i) => [i.debitoId, i.importe]));

  function alternar(id: string, marcado: boolean) {
    const nuevos = marcado ? [...elegidos, id] : elegidos.filter((e) => e !== id);
    setElegidos(nuevos);
    const total = resumen.deudas.filter((d) => nuevos.includes(d.debito.id)).reduce((s, d) => s + d.pendiente, 0);
    setTexto(formatAmount(total));
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (importe <= 0) return;
    setGuardando(true);
    try {
      const recibo = await servicios.cuentaCorriente.registrarPago({
        clienteId: cliente.id,
        importe,
        medio,
        debitoIds: modo === "manual" ? elegidos : undefined,
        usuarioId: usuario.id,
      });
      onRegistrado(recibo, resumen.saldo - importe);
    } catch (err) {
      toast.error(err instanceof ErrorDeNegocio ? err.message : "No se pudo registrar el pago");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={registrar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Registrar pago</DialogTitle>
        <DialogDescription>
          {cliente.razonSocial} · saldo <span className="tabular font-medium text-foreground">{formatMoney(resumen.saldo)}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="importe">Importe</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="importe"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="decimal"
              className="tabular h-10 pl-7 text-right text-base"
              autoFocus
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Medio de pago</Label>
          <Select value={medio} onValueChange={(v) => setMedio(v as MedioPago)}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIOS_PAGO_CUENTA.map((m) => (
                <SelectItem key={m} value={m}>
                  {ETIQUETA_MEDIO_PAGO[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Imputación</Label>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            {(
              [
                ["automatica", "A la más vieja"],
                ["manual", "Elegir comprobantes"],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModo(valor)}
                className={cn("rounded-md px-3 py-1 font-medium", modo === valor ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
          {resumen.deudas.length === 0 && <li className="p-3 text-sm text-muted-foreground">No hay comprobantes pendientes.</li>}
          {resumen.deudas.map((d) => {
            const dias = diasVencido(d.debito.vencimiento, hoy);
            const imputado = aplicado.get(d.debito.id) ?? 0;
            return (
              <li key={d.debito.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {modo === "manual" && (
                  <Checkbox
                    checked={elegidos.includes(d.debito.id)}
                    onCheckedChange={(v) => alternar(d.debito.id, v === true)}
                    aria-label={`Imputar ${d.debito.descripcion}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.debito.descripcion}</p>
                  <p className={cn("text-xs", dias > 0 ? "text-destructive" : "text-muted-foreground")}>
                    Vence {formatDate(d.debito.vencimiento + "T00:00:00")}
                    {dias > 0 && ` · vencido hace ${dias} ${dias === 1 ? "día" : "días"}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular">{formatMoney(d.pendiente)}</p>
                  {imputado > 0 && (
                    <p className="tabular text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      −{formatMoney(imputado)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {vista.sobrante > 0 && importe > 0 && (
          <p className="text-sm text-muted-foreground">
            Quedan <span className="tabular font-medium text-foreground">{formatMoney(vista.sobrante)}</span> como saldo a favor del
            cliente.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={guardando || importe <= 0 || (modo === "manual" && elegidos.length === 0)}>
        Registrar pago y emitir recibo
      </Button>
    </form>
  );
}

export function PagoDialog({
  cuenta,
  abierto,
  onAbierto,
}: {
  cuenta: CuentaCliente;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
}) {
  const [emitido, setEmitido] = useState<{ recibo: Recibo; saldo: number } | null>(null);

  function cambiar(v: boolean) {
    if (!v) setEmitido(null);
    onAbierto(v);
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {emitido ? (
          <ReciboEmitido recibo={emitido.recibo} saldoRestante={emitido.saldo} onCerrar={() => cambiar(false)} />
        ) : (
          abierto && <FormPago cuenta={cuenta} onRegistrado={(recibo, saldo) => setEmitido({ recibo, saldo })} />
        )}
      </DialogContent>
    </Dialog>
  );
}
