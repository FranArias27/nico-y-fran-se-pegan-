"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { normalizarCodigo, validarCodigos } from "@/domain/codigos";
import { calcularPrecios, margenDesdePrecio, precioDesdeMargen } from "@/domain/precios";
import {
  ALICUOTAS,
  ETIQUETA_ALICUOTA,
  ETIQUETA_UNIDAD,
  type AlicuotaIva,
  type Articulo,
  type Categoria,
  type UnidadMedida,
} from "@/domain/types";
import { formatAmount, formatMoney, formatPercent, formatQty, parseMoney, parseQty } from "@/lib/format";
import { ErrorCodigos, ErrorDeNegocio } from "@/services";

interface FilaCodigo {
  clave: number;
  codigo: string;
  cantidad: string;
}

const pct = (pb: number) => (pb / 100).toString().replace(".", ",");

function Campo({ id, etiqueta, children, ayuda }: { id?: string; etiqueta: string; children: React.ReactNode; ayuda?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function ArticuloForm({
  articulo,
  categorias,
  articulos,
  onGuardado,
  onCancelar,
}: {
  articulo?: Articulo;
  categorias: Categoria[];
  articulos: Articulo[];
  onGuardado: (a: Articulo) => void;
  onCancelar: () => void;
}) {
  const servicios = useServicios();
  const base = articulo ? precioDesdeMargen(articulo.costo, articulo.margen) : 0;

  const [codigo, setCodigo] = useState(articulo?.codigo ?? "");
  const [nombre, setNombre] = useState(articulo?.nombre ?? "");
  const [marca, setMarca] = useState(articulo?.marca ?? "");
  const [categoriaId, setCategoriaId] = useState(articulo?.categoriaId ?? categorias[0]?.id ?? "");
  const [unidad, setUnidad] = useState<UnidadMedida>(articulo?.unidad ?? "unidad");
  const [alicuota, setAlicuota] = useState<AlicuotaIva>(articulo?.alicuotaIva ?? 2100);
  const [redondear, setRedondear] = useState(articulo?.redondeo === "centena");
  const [costoTxt, setCostoTxt] = useState(articulo ? formatAmount(articulo.costo) : "");
  const [margenTxt, setMargenTxt] = useState(articulo ? pct(articulo.margen) : "40");
  const [precioTxt, setPrecioTxt] = useState(articulo ? formatAmount(base) : "");
  const [stockTxt, setStockTxt] = useState(articulo ? formatQty(articulo.stock) : "0");
  const [minimoTxt, setMinimoTxt] = useState(articulo ? formatQty(articulo.stockMinimo) : "0");
  const [codigos, setCodigos] = useState<FilaCodigo[]>(
    (articulo?.codigosBarra ?? []).map((c, i) => ({ clave: i, codigo: c.codigo, cantidad: formatQty(c.cantidad) })),
  );
  const [guardando, setGuardando] = useState(false);

  const costo = parseMoney(costoTxt) ?? 0;
  const precioNetoBase = parseMoney(precioTxt) ?? 0;
  const margen = margenDesdePrecio(costo, precioNetoBase);
  const precios = calcularPrecios(precioNetoBase, alicuota, redondear ? "centena" : "ninguno");
  const margenEfectivo = margenDesdePrecio(costo, precios.precioNeto);

  // --- Cálculo en ambos sentidos ---
  function cambiarCosto(txt: string) {
    setCostoTxt(txt);
    const c = parseMoney(txt);
    const m = parseMoney(margenTxt);
    if (c !== null && m !== null) setPrecioTxt(formatAmount(precioDesdeMargen(c, m)));
  }
  function cambiarMargen(txt: string) {
    setMargenTxt(txt);
    const m = parseMoney(txt); // el margen tiene 2 decimales, igual que los centavos
    if (m !== null) setPrecioTxt(formatAmount(precioDesdeMargen(costo, m)));
  }
  function cambiarPrecio(txt: string) {
    setPrecioTxt(txt);
    const p = parseMoney(txt);
    const m = p !== null ? margenDesdePrecio(costo, p) : null;
    if (m !== null) setMargenTxt(pct(m));
  }

  // --- Códigos de barra ---
  const codigosBarra = codigos.map((c) => ({ codigo: c.codigo.trim(), cantidad: parseQty(c.cantidad) ?? 0 }));
  const conflictos = validarCodigos(articulo?.id ?? null, codigo, codigosBarra, articulos);
  const conflictoDe = (cod: string) => conflictos.find((c) => c.codigo === normalizarCodigo(cod));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (conflictos.length > 0) {
      toast.error("Hay códigos repetidos. Corregilos antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const guardado = await servicios.articulos.guardar({
        id: articulo?.id,
        codigo,
        nombre,
        marca: marca.trim(),
        categoriaId,
        unidad,
        costo,
        margen: margen ?? parseMoney(margenTxt) ?? 0,
        alicuotaIva: alicuota,
        redondeo: redondear ? "centena" : "ninguno",
        precioNetoBase,
        stock: parseQty(stockTxt) ?? 0,
        stockMinimo: parseQty(minimoTxt) ?? 0,
        codigosBarra: codigosBarra.filter((c) => c.codigo !== ""),
        activo: articulo?.activo ?? true,
      });
      toast.success(articulo ? "Artículo actualizado" : "Artículo creado");
      onGuardado(guardado);
    } catch (err) {
      if (err instanceof ErrorCodigos) toast.error(`El código ${err.conflictos[0].codigo} ya está en uso`);
      else if (err instanceof ErrorDeNegocio) toast.error(err.message);
      else throw err;
    } finally {
      setGuardando(false);
    }
  }

  const conflictoInterno = conflictoDe(codigo);

  return (
    <form onSubmit={guardar} className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Campo id="codigo" etiqueta="Código interno">
          <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required aria-invalid={!!conflictoInterno} />
          {conflictoInterno?.articuloExistente && (
            <p className="text-xs text-destructive">Lo usa «{conflictoInterno.articuloExistente.nombre}».</p>
          )}
        </Campo>
        <Campo id="marca" etiqueta="Marca">
          <Input id="marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="nombre" etiqueta="Descripción">
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </Campo>
        </div>
        <Campo etiqueta="Categoría">
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
        </Campo>
        <Campo etiqueta="Unidad de medida">
          <Select value={unidad} onValueChange={(v) => setUnidad(v as UnidadMedida)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETIQUETA_UNIDAD) as UnidadMedida[]).map((u) => (
                <SelectItem key={u} value={u}>
                  {ETIQUETA_UNIDAD[u].singular}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </section>

      <Separator />

      <section className="grid gap-4">
        <h3 className="text-sm font-semibold">Precio (sin IVA)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="costo" etiqueta="Costo">
            <Input id="costo" inputMode="decimal" value={costoTxt} onChange={(e) => cambiarCosto(e.target.value)} className="tabular" />
          </Campo>
          <Campo id="margen" etiqueta="% de ganancia">
            <Input id="margen" inputMode="decimal" value={margenTxt} onChange={(e) => cambiarMargen(e.target.value)} className="tabular" />
          </Campo>
          <Campo id="precio" etiqueta="Precio de venta neto">
            <Input id="precio" inputMode="decimal" value={precioTxt} onChange={(e) => cambiarPrecio(e.target.value)} className="tabular" />
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Alícuota de IVA">
            <Select value={String(alicuota)} onValueChange={(v) => setAlicuota(Number(v) as AlicuotaIva)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALICUOTAS.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {ETIQUETA_ALICUOTA[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <div className="flex items-center gap-3 self-end pb-1.5 sm:col-span-2">
            <Switch id="redondeo" checked={redondear} onCheckedChange={setRedondear} />
            <Label htmlFor="redondeo">Redondear el precio final a la centena</Label>
          </div>
        </div>
        <div className="grid gap-1 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Precio neto</p>
            <p className="tabular font-semibold">{formatMoney(precios.precioNeto)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Precio final con IVA</p>
            <p className="tabular text-lg font-bold">{formatMoney(precios.precioFinal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margen efectivo</p>
            <p className={`tabular font-semibold ${margenEfectivo !== null && margenEfectivo < 0 ? "text-destructive" : ""}`}>
              {margenEfectivo === null ? "—" : formatPercent(margenEfectivo / 100)}
            </p>
          </div>
        </div>
      </section>

      <Separator />

      <section className="grid gap-4 sm:grid-cols-2">
        <Campo id="stock" etiqueta={`Stock (${ETIQUETA_UNIDAD[unidad].corta})`}>
          <Input id="stock" inputMode="decimal" value={stockTxt} onChange={(e) => setStockTxt(e.target.value)} className="tabular" />
        </Campo>
        <Campo id="minimo" etiqueta={`Stock mínimo (${ETIQUETA_UNIDAD[unidad].corta})`}>
          <Input id="minimo" inputMode="decimal" value={minimoTxt} onChange={(e) => setMinimoTxt(e.target.value)} className="tabular" />
        </Campo>
      </section>

      <Separator />

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Códigos de barra</h3>
            <p className="text-xs text-muted-foreground">
              Cada código equivale a una cantidad: por ejemplo, el de la caja x12 suma 12 unidades.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCodigos((cs) => [...cs, { clave: Math.max(-1, ...cs.map((c) => c.clave)) + 1, codigo: "", cantidad: "1" }])
            }
          >
            <PlusIcon /> Agregar
          </Button>
        </div>
        {codigos.length === 0 && <p className="text-sm text-muted-foreground">Sin códigos de barra.</p>}
        {codigos.map((fila) => {
          const conflicto = fila.codigo.trim() ? conflictoDe(fila.codigo) : undefined;
          return (
            <div key={fila.clave} className="grid gap-1">
              <div className="flex items-center gap-2">
                <Input
                  value={fila.codigo}
                  onChange={(e) => setCodigos((cs) => cs.map((c) => (c.clave === fila.clave ? { ...c, codigo: e.target.value } : c)))}
                  placeholder="Código (EAN)"
                  className="font-mono"
                  aria-label="Código de barra"
                  aria-invalid={!!conflicto}
                />
                <span className="text-sm whitespace-nowrap text-muted-foreground">equivale a</span>
                <Input
                  value={fila.cantidad}
                  onChange={(e) => setCodigos((cs) => cs.map((c) => (c.clave === fila.clave ? { ...c, cantidad: e.target.value } : c)))}
                  inputMode="decimal"
                  className="tabular w-20 text-right"
                  aria-label="Cantidad equivalente"
                />
                <span className="w-6 text-sm text-muted-foreground">{ETIQUETA_UNIDAD[unidad].corta}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar código"
                  onClick={() => setCodigos((cs) => cs.filter((c) => c.clave !== fila.clave))}
                >
                  <Trash2Icon />
                </Button>
              </div>
              {conflicto && (
                <p className="text-xs text-destructive">
                  {conflicto.articuloExistente
                    ? `Este código ya está asignado a «${conflicto.articuloExistente.nombre}».`
                    : "Este código está repetido."}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background px-4 py-3">
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || conflictos.length > 0}>
          {articulo ? "Guardar cambios" : "Crear artículo"}
        </Button>
      </div>
    </form>
  );
}

