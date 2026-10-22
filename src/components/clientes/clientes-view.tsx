"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SearchIcon } from "lucide-react";
import { EstadoClienteBadge } from "@/components/common/estado-cliente-badge";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizarTexto } from "@/domain/codigos";
import { CLIENTE_CONSUMIDOR_FINAL_ID, ETIQUETA_CONDICION_IVA } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { cn } from "@/lib/utils";
import { ClienteForm } from "./cliente-form";

type Filtro = "todos" | "deuda" | "vencidos" | "cc";

export function ClientesView() {
  const router = useRouter();
  const { datos: cartera } = useConsulta((s) => s.cuentaCorriente.cartera());
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [nuevo, setNuevo] = useState(false);

  if (!cartera) {
    return (
      <div className="grid gap-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[70vh]" />
      </div>
    );
  }

  const palabras = normalizarTexto(busqueda).split(/\s+/).filter(Boolean);
  const cuentas = cartera.cuentas
    .filter((c) => c.cliente.id !== CLIENTE_CONSUMIDOR_FINAL_ID)
    .filter((c) => {
      const texto = normalizarTexto(`${c.cliente.razonSocial} ${c.cliente.nombreFantasia ?? ""} ${c.cliente.documento}`);
      return palabras.every((p) => texto.includes(p));
    })
    .filter((c) =>
      filtro === "deuda"
        ? c.resumen.deuda > 0
        : filtro === "vencidos"
          ? c.resumen.vencido > 0
          : filtro === "cc"
            ? c.cliente.cuentaCorriente
            : true,
    )
    .sort((a, b) => b.resumen.saldo - a.resumen.saldo || a.cliente.razonSocial.localeCompare(b.cliente.razonSocial, "es"));

  const conDeuda = cartera.cuentas.filter((c) => c.resumen.deuda > 0).length;
  const conVencidos = cartera.cuentas.filter((c) => c.resumen.vencido > 0).length;

  return (
    <div className="grid gap-4 p-4 md:p-6">
      <PageHeader
        titulo="Clientes"
        descripcion="Saldos de cuenta corriente al día de hoy."
        acciones={
          <Button onClick={() => setNuevo(true)}>
            <PlusIcon /> Nuevo cliente
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, fantasía o CUIT…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["todos", "Todos"],
              ["cc", "Con cuenta corriente"],
              ["deuda", `Con deuda (${conDeuda})`],
              ["vencidos", `Con vencidos (${conVencidos})`],
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

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Condición IVA</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Límite</th>
              <th className="px-4 py-2 text-right font-medium">Vencido</th>
              <th className="px-4 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cuentas.map(({ cliente, resumen }) => (
              <tr key={cliente.id} onClick={() => router.push(`/clientes/${cliente.id}`)} className="cursor-pointer hover:bg-muted/50">
                <td className="px-4 py-2.5">
                  <Link href={`/clientes/${cliente.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {cliente.razonSocial}
                  </Link>
                  {cliente.nombreFantasia && <p className="text-xs text-muted-foreground">{cliente.nombreFantasia}</p>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{ETIQUETA_CONDICION_IVA[cliente.condicionIva]}</td>
                <td className="px-4 py-2.5">
                  <EstadoClienteBadge estado={cliente.estado} />
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {cliente.cuentaCorriente ? cliente.limiteCredito > 0 ? <Money value={cliente.limiteCredito} /> : "Sin límite" : "Sin cuenta"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {resumen.vencido > 0 ? (
                    <span>
                      <Money value={resumen.vencido} className="text-destructive" />
                      <span className="block text-xs text-muted-foreground">hasta {resumen.maxDiasVencido} días</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money
                    value={resumen.saldo}
                    className={cn(
                      "font-semibold",
                      cliente.limiteCredito > 0 && resumen.saldo > cliente.limiteCredito && "text-destructive",
                      resumen.saldo < 0 && "text-emerald-700 dark:text-emerald-400",
                    )}
                  />
                  {resumen.saldo < 0 && <span className="block text-xs text-muted-foreground">a favor</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cuentas.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No hay clientes que coincidan.</p>}
      </div>

      <ul className="grid gap-2 md:hidden">
        {cuentas.map(({ cliente, resumen }) => (
          <li key={cliente.id}>
            <Link href={`/clientes/${cliente.id}`} className="grid gap-1 rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{cliente.razonSocial}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {cliente.nombreFantasia ?? ETIQUETA_CONDICION_IVA[cliente.condicionIva]}
                  </p>
                </div>
                <Money value={resumen.saldo} className="font-semibold" />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <EstadoClienteBadge estado={cliente.estado} />
                {resumen.vencido > 0 && (
                  <span className="text-destructive">
                    Vencido <Money value={resumen.vencido} />
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Sheet open={nuevo} onOpenChange={setNuevo}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Nuevo cliente</SheetTitle>
            <SheetDescription>El tipo de factura se elige según su condición frente al IVA.</SheetDescription>
          </SheetHeader>
          {nuevo && (
            <div className="px-4">
              <ClienteForm
                onGuardado={(c) => {
                  setNuevo(false);
                  router.push(`/clientes/${c.id}`);
                }}
                onCancelar={() => setNuevo(false)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
