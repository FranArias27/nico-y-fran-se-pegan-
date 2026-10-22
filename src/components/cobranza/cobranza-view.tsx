"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneIcon } from "lucide-react";
import { WhatsAppButton } from "@/components/clientes/whatsapp-button";
import { EstadoClienteBadge } from "@/components/common/estado-cliente-badge";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { aFechaISO } from "@/domain/fechas";
import { useConsulta } from "@/hooks/use-consulta";
import { formatMoney, formatPercent } from "@/lib/format";
import { TramosDeuda } from "@/components/clientes/tramos";
import { TramosChart } from "./tramos-chart";

/** Días de atraso a partir de los cuales un cliente pasa a "para llamar". */
const DIAS_PARA_LLAMAR = 7;
const CLAVE_LLAMADOS = "el-tornillo:llamados";

/** Clientes ya llamados hoy: comodidad por usuario, se guarda en este navegador. */
function useLlamados(hoy: string) {
  const [llamados, setLlamados] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_LLAMADOS) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  function marcar(clienteId: string, valor: boolean) {
    const nuevos = { ...llamados };
    if (valor) nuevos[clienteId] = hoy;
    else delete nuevos[clienteId];
    setLlamados(nuevos);
    try {
      localStorage.setItem(CLAVE_LLAMADOS, JSON.stringify(nuevos));
    } catch {
      // Sin almacenamiento: la marca dura mientras la pantalla esté abierta.
    }
  }
  return { llamadoHoy: (id: string) => llamados[id] === hoy, marcar };
}

function Kpi({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: React.ReactNode; detalle?: string; tono?: "alerta" }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <div className={`mt-1 text-lg font-bold tracking-tight sm:text-3xl ${tono === "alerta" ? "text-destructive" : ""}`}>{valor}</div>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

export function CobranzaView() {
  const { datos: cartera } = useConsulta((s) => s.cuentaCorriente.cartera());
  const hoy = aFechaISO(new Date());
  const { llamadoHoy, marcar } = useLlamados(hoy);

  if (!cartera) {
    return (
      <div className="grid gap-4 p-4 md:p-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const deudores = cartera.cuentas.filter((c) => c.resumen.deuda > 0).sort((a, b) => b.resumen.deuda - a.resumen.deuda);
  const paraLlamar = deudores
    .filter((c) => c.resumen.maxDiasVencido > DIAS_PARA_LLAMAR)
    .sort((a, b) => b.resumen.maxDiasVencido - a.resumen.maxDiasVencido);
  const pctVencido = cartera.enLaCalle > 0 ? (cartera.vencido / cartera.enLaCalle) * 100 : 0;

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <PageHeader titulo="Cobranza" descripcion="Lo que te deben, cuánto está vencido y a quién hay que llamar." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Total en la calle" valor={<Money value={cartera.enLaCalle} />} detalle={`${deudores.length} clientes con saldo`} />
        <Kpi
          etiqueta="Total vencido"
          valor={<Money value={cartera.vencido} />}
          detalle={`${formatPercent(pctVencido, 0)} de lo que está en la calle`}
          tono="alerta"
        />
        <Kpi etiqueta="Cobrado en el mes" valor={<Money value={cartera.cobradoMes} />} detalle="Pagos de cuenta corriente" />
        <Kpi
          etiqueta="Para llamar"
          valor={paraLlamar.length}
          detalle={`Clientes con vencidos de más de ${DIAS_PARA_LLAMAR} días`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deuda por antigüedad</CardTitle>
          <CardDescription>Saldo pendiente según cuántos días pasaron desde el vencimiento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TramosChart tramos={cartera.tramos} />
          <TramosDeuda tramos={cartera.tramos} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ranking de deudores</CardTitle>
            <CardDescription>Los 10 clientes que más deben.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ol className="divide-y">
              {deudores.slice(0, 10).map((c, i) => {
                const proporcion = deudores[0] ? c.resumen.deuda / deudores[0].resumen.deuda : 0;
                return (
                  <li key={c.cliente.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-right text-sm text-muted-foreground tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/clientes/${c.cliente.id}`} className="block truncate font-medium hover:underline">
                        {c.cliente.razonSocial}
                      </Link>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-[var(--serie-1)]" style={{ width: `${proporcion * 100}%` }} />
                      </div>
                    </div>
                    <div className="w-44 text-right">
                      <Money value={c.resumen.deuda} className="font-semibold" />
                      <p className="tabular text-xs whitespace-nowrap text-muted-foreground">
                        {c.resumen.vencido > 0 ? `${formatMoney(c.resumen.vencido)} vencido` : "Nada vencido"}
                      </p>
                    </div>
                    <WhatsAppButton cuenta={c} soloIcono size="sm" />
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Para llamar <Badge variant="secondary">{paraLlamar.length}</Badge>
            </CardTitle>
            <CardDescription>
              Vencidos hace más de {DIAS_PARA_LLAMAR} días, del atraso más grande al más chico. Marcá a quién ya llamaste hoy.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {paraLlamar.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">No hay clientes para llamar. ¡Bien ahí!</p>
            ) : (
              <ul className="divide-y">
                {paraLlamar.map((c) => {
                  const llamado = llamadoHoy(c.cliente.id);
                  return (
                    <li key={c.cliente.id} className={`flex items-center gap-3 px-4 py-2.5 ${llamado ? "opacity-60" : ""}`}>
                      <Checkbox
                        checked={llamado}
                        onCheckedChange={(v) => marcar(c.cliente.id, v === true)}
                        aria-label={`Marcar a ${c.cliente.razonSocial} como llamado`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/clientes/${c.cliente.id}`} className={`truncate font-medium hover:underline ${llamado ? "line-through" : ""}`}>
                            {c.cliente.razonSocial}
                          </Link>
                          {c.cliente.estado !== "habilitado" && <EstadoClienteBadge estado={c.cliente.estado} />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-destructive">{c.resumen.maxDiasVencido} días de atraso</span> ·{" "}
                          {formatMoney(c.resumen.vencido)} vencido
                        </p>
                      </div>
                      {c.cliente.telefono && (
                        <Button variant="ghost" size="icon-sm" asChild aria-label={`Llamar a ${c.cliente.razonSocial}`}>
                          <a href={`tel:${c.cliente.telefono.replace(/\D/g, "")}`}>
                            <PhoneIcon />
                          </a>
                        </Button>
                      )}
                      <WhatsAppButton cuenta={c} soloIcono size="sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
