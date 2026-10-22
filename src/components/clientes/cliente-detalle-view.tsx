"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, HandCoinsIcon, PencilIcon } from "lucide-react";
import { EstadoClienteBadge } from "@/components/common/estado-cliente-badge";
import { Money } from "@/components/common/money";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diasVencido } from "@/domain/cuenta-corriente";
import { aFechaISO } from "@/domain/fechas";
import { ETIQUETA_CONDICION_IVA, ETIQUETA_MEDIO_PAGO, ETIQUETA_MOVIMIENTO, type Movimiento } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatCuit, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClienteForm } from "./cliente-form";
import { PagoDialog } from "./pago-dialog";
import { TramosDeuda } from "./tramos";
import { WhatsAppButton } from "./whatsapp-button";

function Kpi({ etiqueta, children, detalle }: { etiqueta: string; children: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-lg font-bold tracking-tight sm:text-2xl">{children}</div>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function Movimientos({ movimientos }: { movimientos: Movimiento[] }) {
  // Saldo acumulado, del más viejo al más nuevo; se muestra el más nuevo arriba.
  const filas: { m: Movimiento; saldo: number }[] = [];
  for (const m of movimientos) {
    const anterior = filas.at(-1)?.saldo ?? 0;
    filas.push({ m, saldo: anterior + (m.tipo === "venta" ? m.importe : -m.importe) });
  }
  filas.reverse();

  if (filas.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">Sin movimientos.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="px-4 py-2 font-medium">Fecha</th>
            <th className="px-4 py-2 font-medium">Movimiento</th>
            <th className="px-4 py-2 text-right font-medium">Debe</th>
            <th className="px-4 py-2 text-right font-medium">Haber</th>
            <th className="px-4 py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filas.map(({ m, saldo }) => (
            <tr key={m.id}>
              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDate(m.fecha)}</td>
              <td className="px-4 py-2">
                {m.tipo === "venta" && m.ventaId ? (
                  <Link href={`/comprobantes/${m.ventaId}`} className="font-medium hover:underline">
                    {m.descripcion}
                  </Link>
                ) : (
                  <span className="font-medium">{m.descripcion}</span>
                )}
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_MOVIMIENTO[m.tipo]}
                  {m.tipo === "venta" && ` · vence ${formatDate(m.vencimiento + "T00:00:00")}`}
                  {m.tipo === "pago" && m.medio && ` · ${ETIQUETA_MEDIO_PAGO[m.medio]}`}
                </p>
              </td>
              <td className="tabular px-4 py-2 text-right">{m.tipo === "venta" ? formatMoney(m.importe) : ""}</td>
              <td className="tabular px-4 py-2 text-right text-emerald-700 dark:text-emerald-400">
                {m.tipo !== "venta" ? formatMoney(m.importe) : ""}
              </td>
              <td className="tabular px-4 py-2 text-right font-medium">{formatMoney(saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClienteDetalleView() {
  const { id } = useParams<{ id: string }>();
  const servicios = useServicios();
  const { datos: cuenta, cargando } = useConsulta((s) => s.cuentaCorriente.deCliente(id), [id]);
  const [pago, setPago] = useState(false);
  const [editar, setEditar] = useState(false);

  if (cargando && !cuenta) return <Skeleton className="m-6 h-[80vh]" />;
  if (!cuenta) return <p className="p-6 text-muted-foreground">No se encontró el cliente.</p>;

  const { cliente, resumen, movimientos } = cuenta;
  const hoy = aFechaISO(servicios.ahora());
  const disponible = cliente.limiteCredito - resumen.saldo;

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <div>
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{cliente.razonSocial}</h1>
              <EstadoClienteBadge estado={cliente.estado} />
            </div>
            <p className="text-sm text-muted-foreground">
              {cliente.nombreFantasia && `${cliente.nombreFantasia} · `}
              {ETIQUETA_CONDICION_IVA[cliente.condicionIva]}
              {cliente.documento &&
                ` · ${cliente.documento.length === 11 ? `CUIT ${formatCuit(cliente.documento)}` : `DNI ${cliente.documento}`}`}
              {cliente.telefono && ` · Tel. ${cliente.telefono}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditar(true)}>
              <PencilIcon /> Editar
            </Button>
            <WhatsAppButton cuenta={cuenta} />
            {cliente.cuentaCorriente && (
              <Button onClick={() => setPago(true)} disabled={resumen.deuda <= 0 && resumen.saldo <= 0}>
                <HandCoinsIcon /> Registrar pago
              </Button>
            )}
          </div>
        </div>
        {cliente.notas && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            {cliente.notas}
          </p>
        )}
      </div>

      {cliente.cuentaCorriente ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi etiqueta="Saldo" detalle={resumen.saldoAFavor > 0 ? `Incluye ${formatMoney(resumen.saldoAFavor)} a favor` : undefined}>
              <Money value={resumen.saldo} />
            </Kpi>
            <Kpi etiqueta="Vencido" detalle={resumen.maxDiasVencido > 0 ? `El más viejo, hace ${resumen.maxDiasVencido} días` : "Nada vencido"}>
              <Money value={resumen.vencido} className={resumen.vencido > 0 ? "text-destructive" : undefined} />
            </Kpi>
            <Kpi
              etiqueta="Límite de crédito"
              detalle={
                cliente.limiteCredito > 0 ? (
                  <span className={disponible < 0 ? "text-destructive" : undefined}>
                    {disponible < 0 ? `Excedido en ${formatMoney(-disponible)}` : `Disponible ${formatMoney(disponible)}`}
                  </span>
                ) : undefined
              }
            >
              {cliente.limiteCredito > 0 ? <Money value={cliente.limiteCredito} /> : "Sin límite"}
            </Kpi>
            <Kpi etiqueta="Plazo de pago">{cliente.plazoDias} días</Kpi>
          </div>

          <TramosDeuda tramos={resumen.tramos} />

          <Tabs defaultValue="pendientes">
            <TabsList>
              <TabsTrigger value="pendientes">Comprobantes pendientes ({resumen.deudas.length})</TabsTrigger>
              <TabsTrigger value="movimientos">Movimientos ({movimientos.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pendientes">
              <Card className="py-0">
                <CardContent className="px-0">
                  {resumen.deudas.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">No tiene comprobantes pendientes.</p>
                  ) : (
                    <ul className="divide-y">
                      {resumen.deudas.map((d) => {
                        const dias = diasVencido(d.debito.vencimiento, hoy);
                        return (
                          <li key={d.debito.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                            <div className="min-w-0 flex-1">
                              {d.debito.ventaId ? (
                                <Link href={`/comprobantes/${d.debito.ventaId}`} className="font-medium hover:underline">
                                  {d.debito.descripcion}
                                </Link>
                              ) : (
                                <p className="font-medium">{d.debito.descripcion}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Emitido {formatDate(d.debito.fecha)} · vence {formatDate(d.debito.vencimiento + "T00:00:00")}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                dias === 0
                                  ? "bg-muted text-muted-foreground"
                                  : dias > 30
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-amber-500/15 text-amber-800 dark:text-amber-400",
                              )}
                            >
                              {dias === 0 ? "Al día" : `${dias} ${dias === 1 ? "día" : "días"} vencido`}
                            </span>
                            <div className="w-32 text-right">
                              <Money value={d.pendiente} className="font-semibold" />
                              {d.pendiente < d.debito.importe && (
                                <p className="tabular text-xs text-muted-foreground">de {formatMoney(d.debito.importe)}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="movimientos">
              <Card className="py-0">
                <CardContent className="px-0">
                  <Movimientos movimientos={movimientos} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sin cuenta corriente</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Este cliente compra al contado. Para venderle a cuenta, habilitá la cuenta corriente desde «Editar».
          </CardContent>
        </Card>
      )}

      <PagoDialog cuenta={cuenta} abierto={pago} onAbierto={setPago} />

      <Sheet open={editar} onOpenChange={setEditar}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Editar cliente</SheetTitle>
            <SheetDescription>{cliente.razonSocial}</SheetDescription>
          </SheetHeader>
          {editar && (
            <div className="px-4">
              <ClienteForm cliente={cliente} onGuardado={() => setEditar(false)} onCancelar={() => setEditar(false)} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
