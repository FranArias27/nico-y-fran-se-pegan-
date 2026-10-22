"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { buscarUsuario } from "@/auth/demo-users";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/layout/page-header";
import { useServicios } from "@/components/providers/servicios-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aFechaISO, inicioDeMes, rangoDePeriodo, type Periodo, type Rango } from "@/domain/fechas";
import { variacion, type VentasPorGrupo } from "@/domain/reportes";
import { ETIQUETA_COMPROBANTE, ETIQUETA_MEDIO_PAGO } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatDate, formatMoney, formatNumeroComprobante, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarrasHorizontales, EvolucionChart } from "./graficos";

const PERIODOS: [Periodo, string][] = [
  ["hoy", "Hoy"],
  ["semana", "Esta semana"],
  ["mes", "Este mes"],
  ["rango", "Rango"],
];

const nombreVendedor = (id: string) => buscarUsuario(id)?.nombre ?? id;
const fechaCorta = (f: string) => formatDate(f + "T00:00:00").slice(0, 5);

function Variacion({ actual, anterior, invertir = false }: { actual: number; anterior: number; invertir?: boolean }) {
  const v = variacion(actual, anterior);
  if (v === null) return <span className="text-xs text-muted-foreground">Sin datos del período anterior</span>;
  const sube = v > 0;
  const bueno = invertir ? !sube : sube;
  const Icono = v === 0 ? MinusIcon : sube ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        v === 0 ? "text-muted-foreground" : bueno ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <Icono className="size-3.5" />
      {sube ? "+" : ""}
      {formatPercent(v / 100, 1)} <span className="font-normal text-muted-foreground">vs. período anterior</span>
    </span>
  );
}

function Kpi({ etiqueta, children, comparacion }: { etiqueta: string; children: React.ReactNode; comparacion?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-lg font-bold tracking-tight sm:text-2xl">{children}</div>
      <div className="mt-1">{comparacion}</div>
    </div>
  );
}

function TablaGrupos({ filas, titulo }: { filas: VentasPorGrupo[]; titulo: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="px-4 py-2 font-medium">{titulo}</th>
            <th className="px-4 py-2 text-right font-medium">Venta neta</th>
            <th className="px-4 py-2 text-right font-medium">Costo</th>
            <th className="px-4 py-2 text-right font-medium">Ganancia</th>
            <th className="px-4 py-2 text-right font-medium">Margen</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filas.map((f) => (
            <tr key={f.clave}>
              <td className="px-4 py-2">{f.nombre}</td>
              <td className="tabular px-4 py-2 text-right">{formatMoney(f.neto)}</td>
              <td className="tabular px-4 py-2 text-right text-muted-foreground">{formatMoney(f.costo)}</td>
              <td className={cn("tabular px-4 py-2 text-right font-medium", f.ganancia < 0 && "text-destructive")}>
                {formatMoney(f.ganancia)}
              </td>
              <td className={cn("tabular px-4 py-2 text-right", f.margen !== null && f.margen < 0 && "text-destructive")}>
                {f.margen === null ? "—" : formatPercent(f.margen / 100, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Sin ventas en el período.</p>}
    </div>
  );
}

export function ReportesView() {
  const servicios = useServicios();
  const hoy = aFechaISO(servicios.ahora());
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [rangoManual, setRangoManual] = useState<Rango>({ desde: inicioDeMes(hoy), hasta: hoy });
  const rango = periodo === "rango" ? rangoManual : rangoDePeriodo(periodo, hoy);
  const rangoValido = rango.desde <= rango.hasta;

  const { datos: r } = useConsulta(
    (s) => s.reportes.generar({ periodo, rango }),
    [periodo, rango.desde, rango.hasta],
  );

  const evolucion = r
    ? r.porDia.map((d, i) => ({
        etiqueta: fechaCorta(d.fecha),
        actual: d.total,
        anterior: r.porDiaAnterior[i]?.total ?? null,
        fechaActual: formatDate(d.fecha + "T00:00:00"),
        fechaAnterior: r.porDiaAnterior[i] ? formatDate(r.porDiaAnterior[i].fecha + "T00:00:00") : null,
      }))
    : [];

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <PageHeader
        titulo="Reportes"
        descripcion={
          r
            ? `Del ${formatDate(r.rango.desde + "T00:00:00")} al ${formatDate(r.rango.hasta + "T00:00:00")} · comparado con ${formatDate(
                r.rangoAnterior.desde + "T00:00:00",
              )} al ${formatDate(r.rangoAnterior.hasta + "T00:00:00")}`
            : "Ventas, ganancia y pérdidas"
        }
      />

      {/* Filtros en una fila, arriba de todo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {PERIODOS.map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setPeriodo(valor)}
              className={cn("rounded-md px-3 py-1 font-medium", periodo === valor ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {periodo === "rango" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              value={rangoManual.desde}
              max={hoy}
              onChange={(e) => e.target.value && setRangoManual({ ...rangoManual, desde: e.target.value })}
              className="w-40"
              aria-label="Desde"
            />
            <span className="text-muted-foreground">al</span>
            <Input
              type="date"
              value={rangoManual.hasta}
              max={hoy}
              onChange={(e) => e.target.value && setRangoManual({ ...rangoManual, hasta: e.target.value })}
              className="w-40"
              aria-label="Hasta"
            />
            {!rangoValido && <span className="text-destructive">El rango no es válido.</span>}
          </div>
        )}
      </div>

      {!r ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <Tabs defaultValue="ventas">
          <TabsList>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="ganancia">Ganancia</TabsTrigger>
            <TabsTrigger value="perdidas">Pérdidas</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------------- Ventas */}
          <TabsContent value="ventas" className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Total vendido" comparacion={<Variacion actual={r.resumen.total} anterior={r.resumenAnterior.total} />}>
                <Money value={r.resumen.total} />
              </Kpi>
              <Kpi etiqueta="Cantidad de ventas" comparacion={<Variacion actual={r.resumen.cantidad} anterior={r.resumenAnterior.cantidad} />}>
                {r.resumen.cantidad.toLocaleString("es-AR")}
              </Kpi>
              <Kpi
                etiqueta="Ticket promedio"
                comparacion={<Variacion actual={r.resumen.ticketPromedio} anterior={r.resumenAnterior.ticketPromedio} />}
              >
                <Money value={r.resumen.ticketPromedio} />
              </Kpi>
            </div>

            {r.porDia.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Evolución diaria</CardTitle>
                  <CardDescription>Total vendido por día, con IVA cuando corresponde.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EvolucionChart datos={evolucion} />
                </CardContent>
              </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Por vendedor</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarrasHorizontales
                    datos={r.porVendedor.map((v) => ({
                      nombre: nombreVendedor(v.vendedorId),
                      valor: v.total,
                      detalle: `${v.cantidad} ventas · ticket promedio ${formatMoney(v.ticketPromedio)}`,
                    }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Por medio de pago</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarrasHorizontales
                    datos={r.porMedio.map((m) => ({
                      nombre: ETIQUETA_MEDIO_PAGO[m.medio],
                      valor: m.importe,
                      detalle: `${m.operaciones} operaciones`,
                    }))}
                  />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Por categoría</CardTitle>
                <CardDescription>Venta neta de IVA.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarrasHorizontales ancho={190} datos={r.porCategoria.map((c) => ({ nombre: c.nombre, valor: c.neto }))} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------------------- Ganancia */}
          <TabsContent value="ganancia" className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Ganancia bruta" comparacion={<Variacion actual={r.resumen.ganancia} anterior={r.resumenAnterior.ganancia} />}>
                <Money value={r.resumen.ganancia} />
              </Kpi>
              <Kpi
                etiqueta="Margen sobre la venta"
                comparacion={
                  r.resumenAnterior.margen !== null && (
                    <span className="text-xs text-muted-foreground">
                      Período anterior: {formatPercent(r.resumenAnterior.margen / 100, 1)}
                    </span>
                  )
                }
              >
                {r.resumen.margen === null ? "—" : formatPercent(r.resumen.margen / 100, 1)}
              </Kpi>
              <Kpi etiqueta="Venta neta (sin IVA)" comparacion={<span className="text-xs text-muted-foreground">Costo: {formatMoney(r.resumen.costo)}</span>}>
                <Money value={r.resumen.neto} />
              </Kpi>
            </div>
            <p className="text-xs text-muted-foreground">
              La ganancia usa el costo de cada artículo al momento de la venta, así que no cambia cuando se actualizan los costos.
            </p>

            <Card className="py-0">
              <CardHeader className="pt-6">
                <CardTitle>Por categoría</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <TablaGrupos filas={r.porCategoria} titulo="Categoría" />
              </CardContent>
            </Card>

            <Card className="py-0">
              <CardHeader className="pt-6">
                <CardTitle>Por artículo</CardTitle>
                <CardDescription>Ordenado por ganancia, de mayor a menor.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[32rem] overflow-y-auto px-0 pb-2">
                <TablaGrupos filas={r.porArticulo} titulo="Artículo" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------------------- Pérdidas */}
          <TabsContent value="perdidas" className="grid gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Kpi etiqueta="Pérdida por ventas bajo costo" comparacion={<span className="text-xs text-muted-foreground">{r.bajoCosto.length} líneas de venta</span>}>
                <Money value={r.bajoCosto.reduce((s, b) => s + b.perdida, 0)} className="text-destructive" />
              </Kpi>
              <Kpi
                etiqueta="Descuentos otorgados (neto)"
                comparacion={<Variacion actual={r.resumen.descuentos} anterior={r.resumenAnterior.descuentos} invertir />}
              >
                <Money value={r.resumen.descuentos} />
              </Kpi>
            </div>

            <Card className="py-0">
              <CardHeader className="pt-6">
                <CardTitle>Ventas por debajo del costo</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] overflow-auto px-0 pb-2">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium">Comprobante</th>
                      <th className="px-4 py-2 font-medium">Artículo</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">Neto</th>
                      <th className="px-4 py-2 text-right font-medium">Costo</th>
                      <th className="px-4 py-2 text-right font-medium">Pérdida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.bajoCosto.map((b, i) => (
                      <tr key={`${b.ventaId}-${i}`}>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDate(b.fecha)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/comprobantes/${b.ventaId}`} className="hover:underline">
                            {ETIQUETA_COMPROBANTE[b.tipo]} {formatNumeroComprobante(b.puntoVenta, b.numero)}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{nombreVendedor(b.vendedorId)}</span>
                        </td>
                        <td className="px-4 py-2">{b.descripcion}</td>
                        <td className="tabular px-4 py-2 text-right">{formatQty(b.cantidad)}</td>
                        <td className="tabular px-4 py-2 text-right">{formatMoney(b.neto)}</td>
                        <td className="tabular px-4 py-2 text-right text-muted-foreground">{formatMoney(b.costo)}</td>
                        <td className="tabular px-4 py-2 text-right font-medium text-destructive">{formatMoney(b.perdida)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.bajoCosto.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">No hubo ventas por debajo del costo.</p>
                )}
              </CardContent>
            </Card>

            <Card className="py-0">
              <CardHeader className="pt-6">
                <CardTitle>Descuentos otorgados</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[28rem] overflow-auto px-0 pb-2">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium">Comprobante</th>
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-4 py-2 font-medium">Vendedor</th>
                      <th className="px-4 py-2 text-right font-medium">Neto sin descuento</th>
                      <th className="px-4 py-2 text-right font-medium">Descuento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.descuentos.map((d) => (
                      <tr key={d.ventaId}>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDate(d.fecha)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/comprobantes/${d.ventaId}`} className="hover:underline">
                            {ETIQUETA_COMPROBANTE[d.tipo]} {formatNumeroComprobante(d.puntoVenta, d.numero)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{d.clienteNombre}</td>
                        <td className="px-4 py-2 text-muted-foreground">{nombreVendedor(d.vendedorId)}</td>
                        <td className="tabular px-4 py-2 text-right text-muted-foreground">{formatMoney(d.netoBruto)}</td>
                        <td className="tabular px-4 py-2 text-right font-medium">
                          {formatMoney(d.descuento)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({formatPercent((d.descuento / d.netoBruto) * 100, 1)})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.descuentos.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">No se otorgaron descuentos en el período.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
