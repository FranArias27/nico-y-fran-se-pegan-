"use client";

import { useState } from "react";
import { AlertTriangleIcon, PercentIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { buscarArticulos } from "@/domain/codigos";
import { margenDesdePrecio } from "@/domain/precios";
import { ETIQUETA_ALICUOTA, ETIQUETA_UNIDAD, type Articulo } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatMoney, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArticuloForm } from "./articulo-form";
import { CambioMasivoDialog } from "./cambio-masivo-dialog";

type FiltroStock = "todos" | "bajo" | "negativo";

function estadoStock(a: Articulo): "negativo" | "bajo" | "ok" {
  if (a.stock < 0) return "negativo";
  if (a.stock <= a.stockMinimo) return "bajo";
  return "ok";
}

function StockBadge({ articulo }: { articulo: Articulo }) {
  const estado = estadoStock(articulo);
  const texto = `${formatQty(articulo.stock)} ${ETIQUETA_UNIDAD[articulo.unidad].corta}`;
  if (estado === "ok") return <span className="tabular">{texto}</span>;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "tabular",
        estado === "negativo" ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-800 dark:text-amber-400",
      )}
      title={estado === "negativo" ? "Stock negativo" : `Bajo el mínimo (${formatQty(articulo.stockMinimo)})`}
    >
      <AlertTriangleIcon /> {texto}
    </Badge>
  );
}

export function ArticulosView() {
  const { puede } = useAuth();
  const verCostos = puede("verCostos");
  const editar = puede("editarPrecios");
  const { datos: articulos } = useConsulta((s) => s.articulos.listar());
  const { datos: categorias } = useConsulta((s) => s.articulos.listarCategorias());

  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("todas");
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  const [editando, setEditando] = useState<Articulo | "nuevo" | null>(null);
  const [masivo, setMasivo] = useState(false);

  if (!articulos || !categorias) {
    return (
      <div className="grid gap-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[70vh]" />
      </div>
    );
  }

  const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
  const base = busqueda.trim() ? buscarArticulos(articulos, busqueda, 500) : [...articulos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const visibles = base.filter(
    (a) =>
      (categoriaId === "todas" || a.categoriaId === categoriaId) &&
      (filtroStock === "todos" || estadoStock(a) === filtroStock || (filtroStock === "bajo" && estadoStock(a) === "negativo")),
  );
  const bajos = articulos.filter((a) => estadoStock(a) === "bajo").length;
  const negativos = articulos.filter((a) => estadoStock(a) === "negativo").length;

  return (
    <div className="grid gap-4 p-4 md:p-6">
      <PageHeader
        titulo="Artículos"
        descripcion={`${articulos.length} artículos · precios netos de IVA`}
        acciones={
          editar && (
            <>
              <Button variant="outline" onClick={() => setMasivo(true)}>
                <PercentIcon /> Modificación masiva
              </Button>
              <Button onClick={() => setEditando("nuevo")}>
                <PlusIcon /> Nuevo artículo
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, marca o código…"
            className="pl-9"
          />
        </div>
        <Select value={categoriaId} onValueChange={setCategoriaId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["todos", "Todos"],
              ["bajo", `Bajo mínimo (${bajos + negativos})`],
              ["negativo", `Negativos (${negativos})`],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setFiltroStock(valor)}
              className={cn(
                "rounded-md px-3 py-1 font-medium",
                filtroStock === valor ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla (PC) */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Artículo</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 text-right font-medium">Stock</th>
              {verCostos && <th className="px-4 py-2 text-right font-medium">Costo</th>}
              {verCostos && <th className="px-4 py-2 text-right font-medium">Margen</th>}
              <th className="px-4 py-2 text-right font-medium">Precio neto</th>
              <th className="px-4 py-2 text-right font-medium">IVA</th>
              <th className="px-4 py-2 text-right font-medium">Precio final</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibles.map((a) => {
              const margen = margenDesdePrecio(a.costo, a.precioNeto);
              return (
                <tr
                  key={a.id}
                  onClick={editar ? () => setEditando(a) : undefined}
                  className={cn(editar && "cursor-pointer hover:bg-muted/50")}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{a.codigo}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{a.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.marca}
                      {a.codigosBarra.length > 1 && ` · ${a.codigosBarra.length} códigos de barra`}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{nombreCategoria.get(a.categoriaId)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <StockBadge articulo={a} />
                  </td>
                  {verCostos && <td className="tabular px-4 py-2.5 text-right">{formatMoney(a.costo)}</td>}
                  {verCostos && (
                    <td className={cn("tabular px-4 py-2.5 text-right", margen !== null && margen < 0 && "text-destructive")}>
                      {margen === null ? "—" : formatPercent(margen / 100, 1)}
                    </td>
                  )}
                  <td className="tabular px-4 py-2.5 text-right">{formatMoney(a.precioNeto)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{ETIQUETA_ALICUOTA[a.alicuotaIva]}</td>
                  <td className="tabular px-4 py-2.5 text-right font-semibold">{formatMoney(a.precioFinal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No hay artículos que coincidan.</p>}
      </div>

      {/* Lista (celular) */}
      <ul className="grid gap-2 md:hidden">
        {visibles.map((a) => (
          <li key={a.id}>
            <button
              onClick={editar ? () => setEditando(a) : undefined}
              className="grid w-full gap-1 rounded-xl border bg-card p-3 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{a.nombre}</p>
                <p className="tabular font-semibold whitespace-nowrap">{formatMoney(a.precioFinal)}</p>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {a.codigo} · {a.marca}
                  {verCostos && ` · costo ${formatMoney(a.costo)}`}
                </span>
                <StockBadge articulo={a} />
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editando === "nuevo" ? "Nuevo artículo" : "Editar artículo"}</SheetTitle>
            <SheetDescription>Los precios se cargan netos de IVA.</SheetDescription>
          </SheetHeader>
          {editando !== null && (
            <div className="px-4">
              <ArticuloForm
                key={editando === "nuevo" ? "nuevo" : editando.id}
                articulo={editando === "nuevo" ? undefined : editando}
                categorias={categorias}
                articulos={articulos}
                onGuardado={() => setEditando(null)}
                onCancelar={() => setEditando(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {masivo && <CambioMasivoDialog abierto={masivo} onAbierto={setMasivo} categorias={categorias} articulos={articulos} />}
    </div>
  );
}
