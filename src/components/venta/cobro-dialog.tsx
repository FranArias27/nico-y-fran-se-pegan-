"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, PlusIcon, QrCodeIcon, XIcon } from "lucide-react";
import { Money } from "@/components/common/money";
import { QrImage } from "@/components/impresion/qr-image";
import { useServicios } from "@/components/providers/servicios-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularCobro, MEDIOS_COBRO } from "@/domain/cobro";
import { evaluarVentaACuenta } from "@/domain/cuenta-corriente";
import {
  ETIQUETA_COMPROBANTE,
  ETIQUETA_MEDIO_PAGO,
  type Centavos,
  type Cliente,
  type MedioPago,
  type Pago,
  type TipoComprobante,
} from "@/domain/types";
import { formatAmount, formatMoney, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LineaPago {
  clave: number;
  medio: MedioPago;
  texto: string;
}

interface EstadoQR {
  importe: Centavos;
  cobroId: string;
  qrData: string;
  aprobado: boolean;
}

function texto(importe: Centavos) {
  return formatAmount(importe);
}

/** Montos rápidos para efectivo: exacto y redondeos hacia arriba. */
function montosRapidos(total: Centavos): Centavos[] {
  const pasos = [100000, 500000, 1000000, 2000000, 5000000];
  const montos = new Set<Centavos>([total]);
  for (const p of pasos) montos.add(Math.ceil(total / p) * p);
  return [...montos].sort((a, b) => a - b).slice(0, 5);
}

interface Props {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  tipos: TipoComprobante[];
  tipo: TipoComprobante;
  onTipo: (t: TipoComprobante) => void;
  totales: Record<TipoComprobante, Centavos>;
  cliente: Cliente;
  saldoCliente: Centavos;
  onConfirmar: (pagos: Pago[]) => Promise<void>;
}

export function CobroDialog(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={props.onAbierto}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {props.abierto && <CobroForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function CobroForm({ tipos, tipo, onTipo, totales, cliente, saldoCliente, onConfirmar }: Props) {
  const servicios = useServicios();
  const total = totales[tipo];
  const [lineas, setLineas] = useState<LineaPago[]>([{ clave: 1, medio: "efectivo", texto: texto(total) }]);
  const [tocado, setTocado] = useState(false);
  const [qrs, setQrs] = useState<Record<number, EstadoQR>>({});
  const [procesando, setProcesando] = useState(false);

  // Si el usuario no tocó los importes, siguen al total (por ejemplo al cambiar de comprobante).
  const [totalPrevio, setTotalPrevio] = useState(total);
  if (totalPrevio !== total) {
    setTotalPrevio(total);
    if (!tocado && lineas.length === 1) setLineas([{ ...lineas[0], texto: texto(total) }]);
  }

  const pagos: Pago[] = lineas.map((l) => ({ medio: l.medio, importe: parseMoney(l.texto) ?? 0 }));
  const cobro = calcularCobro(total, pagos);
  const evaluacion = cobro.aCuenta > 0 ? evaluarVentaACuenta(cliente, saldoCliente, cobro.aCuenta) : null;
  const disponible = cliente.limiteCredito - saldoCliente;

  const qrPendiente = lineas.some((l) => {
    if (l.medio !== "qr") return false;
    const qr = qrs[l.clave];
    return !qr || !qr.aprobado || qr.importe !== (parseMoney(l.texto) ?? 0);
  });
  const puedeConfirmar = cobro.completo && !cobro.error && (evaluacion?.permitido ?? true) && !qrPendiente && !procesando;

  // Consulta periódica del estado de los QR generados.
  const pendientes = useMemo(
    () => Object.entries(qrs).filter(([, q]) => !q.aprobado),
    [qrs],
  );
  useEffect(() => {
    if (pendientes.length === 0) return;
    const intervalo = setInterval(async () => {
      for (const [clave, q] of pendientes) {
        const estado = await servicios.pagos.consultarCobroQR(q.cobroId);
        if (estado === "aprobado") {
          setQrs((actual) => ({ ...actual, [clave]: { ...actual[Number(clave)], aprobado: true } }));
        }
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [pendientes, servicios]);

  function cambiarLinea(clave: number, cambio: Partial<LineaPago>) {
    setTocado(true);
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  function agregarLinea() {
    setTocado(true);
    const usados = new Set(lineas.map((l) => l.medio));
    const medio = MEDIOS_COBRO.find((m) => !usados.has(m) && m !== "cuenta_corriente") ?? "transferencia";
    setLineas((ls) => [...ls, { clave: Math.max(...ls.map((l) => l.clave)) + 1, medio, texto: texto(cobro.faltante) }]);
  }

  async function generarQR(linea: LineaPago) {
    const importe = parseMoney(linea.texto) ?? 0;
    if (importe <= 0) return;
    const cobroQR = await servicios.pagos.crearCobroQR(importe, `venta-${Date.now()}`);
    setQrs((q) => ({ ...q, [linea.clave]: { importe, cobroId: cobroQR.id, qrData: cobroQR.qrData, aprobado: false } }));
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeConfirmar) return;
    setProcesando(true);
    try {
      await onConfirmar(pagos.filter((p) => p.importe > 0));
    } finally {
      setProcesando(false);
    }
  }

  const unicaEfectivo = lineas.length === 1 && lineas[0].medio === "efectivo";

  return (
    <form onSubmit={confirmar} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Cobrar</DialogTitle>
        <DialogDescription>
          {cliente.razonSocial} · elegí el comprobante y los medios de pago.
        </DialogDescription>
      </DialogHeader>

      {/* Comprobante */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Comprobante">
        {tipos.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={t === tipo}
            onClick={() => onTipo(t)}
            className={cn(
              "rounded-xl border-2 p-3 text-left transition-colors",
              t === tipo ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <p className="text-sm font-semibold">{ETIQUETA_COMPROBANTE[t]}</p>
            <p className="text-xs text-muted-foreground">
              {t === "A" ? "IVA discriminado" : t === "B" ? "IVA incluido" : "No fiscal, sin IVA"}
            </p>
            <Money value={totales[t]} className="mt-1 block text-lg font-bold" />
          </button>
        ))}
      </div>

      {/* Medios de pago */}
      <div className="grid gap-3">
        {lineas.map((l) => {
          const qr = qrs[l.clave];
          const importe = parseMoney(l.texto) ?? 0;
          const qrVigente = qr && qr.importe === importe;
          return (
            <div key={l.clave} className="grid gap-2 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <Select value={l.medio} onValueChange={(v) => cambiarLinea(l.clave, { medio: v as MedioPago })}>
                  <SelectTrigger className="w-44 shrink-0" aria-label="Medio de pago">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDIOS_COBRO.map((m) => (
                      <SelectItem key={m} value={m} disabled={m === "cuenta_corriente" && !cliente.cuentaCorriente}>
                        {ETIQUETA_MEDIO_PAGO[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    value={l.texto}
                    onChange={(e) => cambiarLinea(l.clave, { texto: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    inputMode="decimal"
                    className="tabular h-10 pl-7 text-right text-base"
                    aria-label={l.medio === "efectivo" ? "Efectivo recibido" : "Importe"}
                    autoFocus={l.clave === 1}
                  />
                </div>
                {lineas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar medio de pago"
                    onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>

              {l.medio === "efectivo" && unicaEfectivo && (
                <div className="flex flex-wrap gap-1.5">
                  {montosRapidos(total).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => cambiarLinea(l.clave, { texto: texto(m) })}
                    >
                      {m === total ? "Exacto" : formatMoney(m).replace(",00", "")}
                    </Button>
                  ))}
                </div>
              )}

              {l.medio === "qr" && (
                <div className="flex items-center gap-3">
                  {qrVigente ? (
                    <>
                      <QrImage texto={qr.qrData} tamano={96} className="rounded border bg-white p-1" />
                      {qr.aprobado ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2Icon className="size-4" /> Pago acreditado en Mercado Pago (simulado)
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Loader2Icon className="size-4 animate-spin" /> Esperando que el cliente escanee y pague…
                        </p>
                      )}
                    </>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => generarQR(l)} disabled={importe <= 0}>
                      <QrCodeIcon /> Generar QR por {formatMoney(importe)}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <Button type="button" variant="ghost" className="justify-self-start" onClick={agregarLinea}>
          <PlusIcon /> Agregar otro medio de pago
        </Button>
      </div>

      {/* Avisos de cuenta corriente */}
      {evaluacion && !evaluacion.permitido && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>No se puede vender a cuenta</AlertTitle>
          <AlertDescription>{evaluacion.avisos[0]}</AlertDescription>
        </Alert>
      )}
      {evaluacion?.permitido && evaluacion.avisos.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangleIcon />
          <AlertTitle>Atención</AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">
            {evaluacion.avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
            {cliente.limiteCredito > 0 && (
              <p>
                Saldo actual {formatMoney(saldoCliente)} · límite {formatMoney(cliente.limiteCredito)} · disponible{" "}
                {formatMoney(Math.max(disponible, 0))}.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {cobro.error && <p className="text-sm text-destructive">{cobro.error}.</p>}

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <Money value={total} className="text-lg font-bold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pagado</p>
          <Money value={cobro.pagado} className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{cobro.vuelto > 0 ? "Vuelto" : "Falta"}</p>
          <Money
            value={cobro.vuelto > 0 ? cobro.vuelto : cobro.faltante}
            className={cn(
              "text-lg font-bold",
              cobro.vuelto > 0 ? "text-emerald-700 dark:text-emerald-400" : cobro.faltante > 0 && "text-destructive",
            )}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={!puedeConfirmar}>
        {procesando ? (
          <>
            <Loader2Icon className="animate-spin" />
            {tipo === "X" ? "Registrando…" : "Solicitando CAE a ARCA (simulado)…"}
          </>
        ) : qrPendiente ? (
          "Falta acreditar el pago con QR"
        ) : (
          <>Confirmar venta · Enter</>
        )}
      </Button>
    </form>
  );
}
