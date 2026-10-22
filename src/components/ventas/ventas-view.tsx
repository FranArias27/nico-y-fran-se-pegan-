"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { buscarUsuario } from "@/auth/demo-users";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizarTexto } from "@/domain/codigos";
import { esNotaCredito, etiquetaComprobante } from "@/domain/comprobante";
import { aFechaISO, inicioDeMes, sumarDias, type Rango } from "@/domain/fechas";
import { ETIQUETA_MEDIO_PAGO, type Venta } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatDateTime, formatNumeroComprobante } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filtro = "todos" | "facturas" | "notas";

function nombreVendedor(v: Venta) {
  return v.vendedorNombre ?? buscarUsuario(v.vendedorId)?.nombre ?? "—";
}

function medios(v: Venta) {
  return [...new Set(v.pagos.map((p) => ETIQUETA_MEDIO_PAGO[p.medio]))].join(", ");
}

/** Importe con signo: las notas de crédito restan. */
const importe = (v: Venta) => (esNotaCredito(v) ? -v.totales.total : v.totales.total);

function Comprobante({ venta }: { venta: Venta }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{etiquetaComprobante(venta)}</span>
      <span className="tabular text-muted-foreground">{formatNumeroComprobante(venta.puntoVenta, venta.numero)}</span>
      {venta.fiscal?.simulado && <Badge variant="outline">Simulado</Badge>}
    </span>
  );
}

export function VentasView() {
  const router = useRouter();
  const hoy = aFechaISO(new Date());
  const [rango, setRango] = useState<Rango>({ desde: hoy, hasta: hoy });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const { datos: ventas } = useConsulta((s) => s.ventas.listar(rango), [rango.desde, rango.hasta]);

  const atajos: [string, Rango][] = [
    ["Hoy", { desde: hoy, hasta: hoy }],
    ["Ayer", { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) }],
    ["7 días", { desde: sumarDias(hoy, -6), hasta: hoy }],
    ["Este mes", { desde: inicioDeMes(hoy), hasta: hoy }],
  ];

  const palabras = normalizarTexto(busqueda).split(/\s+/).filter(Boolean);
  const visibles = (ventas ?? [])
    .filter((v) => (filtro === "facturas" ? !esNotaCredito(v) : filtro === "notas" ? esNotaCredito(v) : true))
    .filter((v) => {
      const texto = normalizarTexto(
        `${v.clienteNombre} ${v.clienteDocumento} ${formatNumeroComprobante(v.puntoVenta, v.numero)} ${v.numero} ${nombreVendedor(v)}`,
      );
      return palabras.every((p) => texto.includes(p));
    });

  const facturas = visibles.filter((v) => !esNotaCredito(v));
  const notas = visibles.filter(esNotaCredito);
  const totalNeto = visibles.reduce((s, v) => s + importe(v), 0);

  return (
    <div className="grid gap-4 p-4 md:p-6">
      <PageHeader titulo="Ventas" descripcion="Comprobantes emitidos. Tocá uno para verlo, reimprimirlo o anularlo." />

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="desde" className="text-xs text-muted-foreground">
            Desde
          </label>
          <Input
            id="desde"
            type="date"
            value={rango.desde}
            max={rango.hasta}
            onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })}
            className="w-40"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="hasta" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <Input
            id="hasta"
            type="date"
            value={rango.hasta}
            min={rango.desde}
            onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })}
            className="w-40"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {atajos.map(([etiqueta, r]) => (
            <button
              key={etiqueta}
              onClick={() => setRango(r)}
              className={cn(
                "rounded-md px-3 py-1 font-medium",
                r.desde === rango.desde && r.hasta === rango.hasta ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, número o vendedor…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["todos", "Todos"],
              ["facturas", "Ventas"],
              ["notas", "Notas de crédito"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={cn("rounded-md px-3 py-1 font-medium", filtro === valor ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {!ventas ? (
        <Skeleton className="h-[60vh]" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Ventas</p>
              <p className="text-lg font-semibold">{facturas.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Notas de crédito</p>
              <p className="text-lg font-semibold">
                {notas.length}
                {notas.length > 0 && (
                  <Money value={-notas.reduce((s, v) => s + v.totales.total, 0)} className="ml-2 text-sm font-normal" />
                )}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border bg-card p-3 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Total (ventas menos notas de crédito)</p>
              <Money value={totalNeto} className="text-lg font-semibold" />
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Comprobante</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Pago</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibles.map((v) => (
                  <tr key={v.id} onClick={() => router.push(`/comprobantes/${v.id}`)} className="cursor-pointer hover:bg-muted/50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(v.fecha)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/comprobantes/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        <Comprobante venta={v} />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{v.clienteNombre}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{nombreVendedor(v)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{medios(v)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Money value={importe(v)} className="font-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No hay comprobantes en este período.</p>
            )}
          </div>

          <ul className="grid gap-2 md:hidden">
            {visibles.map((v) => (
              <li key={v.id}>
                <Link href={`/comprobantes/${v.id}`} className="grid gap-1 rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <Comprobante venta={v} />
                      <p className="truncate text-muted-foreground">{v.clienteNombre}</p>
                    </div>
                    <Money value={importe(v)} className="font-semibold" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(v.fecha)} · {nombreVendedor(v)} · {medios(v)}
                  </p>
                </Link>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">No hay comprobantes en este período.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
