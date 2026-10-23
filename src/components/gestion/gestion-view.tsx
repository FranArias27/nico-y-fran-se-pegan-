"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { useConsulta } from "@/hooks/use-consulta";
import { pedirApi, mutarGestion } from "@/lib/api-cliente";
import { formatMoney, formatQty, formatDateTime } from "@/lib/format";
import type { Caja, Compra, Proveedor, LineaCompra, PedidoGestion } from "@/domain/gestion";
import type { MedioPago } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

interface DatosGestion {
  caja: Caja | null;
  cajas: Caja[];
  proveedores: Proveedor[];
  compras: Compra[];
  siguiente: string | null;
  inventario: { id: string; articuloId: string; delta: number; fecha: string; motivo: string }[];
}
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
function Campo({
  titulo,
  value,
  onChange,
  tipo = "text",
}: {
  titulo: string;
  value: string;
  onChange: (v: string) => void;
  tipo?: string;
}) {
  return (
    <Label className="grid gap-2">
      {titulo}
      <Input
        type={tipo}
        step={tipo === "number" ? "0.001" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Label>
  );
}
export function GestionView() {
  const { perfil } = useAuth();
  const empresa = perfil!.empresaId;
  const [version, setVersion] = useState(0),
    [antes, setAntes] = useState("");
  const { datos, error } = useConsulta(
    async () =>
      (
        await pedirApi(`/api/gestion?empresaId=${empresa}&antes=${encodeURIComponent(antes)}`)
      ).json() as Promise<DatosGestion>,
    [empresa, version, antes],
  );
  const { datos: articulos = [] } = useConsulta((s) => s.articulos.listar());
  const [ocupado, setOcupado] = useState(false);
  const [importeCaja, setImporteCaja] = useState("0"),
    [motivo, setMotivo] = useState("");
  const [nombre, setNombre] = useState(""),
    [documento, setDocumento] = useState(""),
    [telefono, setTelefono] = useState("");
  const [proveedorEditado, setProveedorEditado] = useState(() => crypto.randomUUID());
  const [proveedorId, setProveedorId] = useState(""),
    [comprobante, setComprobante] = useState("");
  const [articuloId, setArticuloId] = useState(""),
    [cantidad, setCantidad] = useState("1"),
    [costo, setCosto] = useState("0");
  const [lineas, setLineas] = useState<LineaCompra[]>([]),
    [pagado, setPagado] = useState("0"),
    [medio, setMedio] = useState<MedioPago>("transferencia");
  const [compraId, setCompraId] = useState(""),
    [pagoProveedor, setPagoProveedor] = useState("0");
  const [inventarioId, setInventarioId] = useState(""),
    [contado, setContado] = useState("0"),
    [motivoInventario, setMotivoInventario] = useState("");
  const [stockAlContar, setStockAlContar] = useState(0);
  async function ejecutar(pedido: PedidoGestion, luego?: () => void) {
    setOcupado(true);
    try {
      await mutarGestion(empresa, pedido);
      toast.success("Operación registrada");
      setVersion((v) => v + 1);
      luego?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setOcupado(false);
    }
  }
  if (error)
    return (
      <p role="alert" className="p-6">
        {error.message}
      </p>
    );
  if (!datos)
    return (
      <p className="p-6" role="status">
        Cargando caja y mercadería…
      </p>
    );
  const articuloInventario = articulos.find((a) => a.id === inventarioId);
  const pesos = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 md:p-6">
      <PageHeader
        titulo="Caja y mercadería"
        descripcion="Apertura y arqueo, proveedores, recepción de compras y conteos de stock."
      />
      <nav className="flex flex-wrap gap-4 text-sm underline">
        <a href="#caja">Caja</a>
        <a href="#proveedores">Proveedores</a>
        <a href="#compras">Compras</a>
        <a href="#inventario">Inventario</a>
      </nav>
      <fieldset disabled={ocupado} className="grid min-w-0 gap-6 disabled:opacity-70">
        <Card id="caja">
          <CardHeader>
            <CardTitle>Caja {datos.caja?.abierta ? "abierta" : "cerrada"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {datos.caja?.abierta && (
              <p>
                Efectivo esperado: <strong>{formatMoney(datos.caja.esperado)}</strong> · Apertura:{" "}
                {formatMoney(datos.caja.apertura)}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                titulo={
                  datos.caja?.abierta ? "Efectivo contado / importe del movimiento ($)" : "Efectivo de apertura ($)"
                }
                tipo="number"
                value={importeCaja}
                onChange={setImporteCaja}
              />
              <Campo titulo="Motivo del ingreso o retiro" value={motivo} onChange={setMotivo} />
            </div>
            <div className="flex flex-wrap gap-3">
              {datos.caja?.abierta ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => void ejecutar({ accion: "movimiento_caja", importe: pesos(importeCaja), motivo })}
                  >
                    Registrar ingreso / retiro
                  </Button>
                  <Button
                    onClick={() => {
                      if (window.confirm(`Cerrar caja con ${formatMoney(pesos(importeCaja))} contados?`))
                        void ejecutar({ accion: "cerrar_caja", importe: pesos(importeCaja) });
                    }}
                  >
                    Cerrar y arquear
                  </Button>
                </>
              ) : (
                <Button onClick={() => void ejecutar({ accion: "abrir_caja", importe: pesos(importeCaja) })}>
                  Abrir caja
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Para un retiro, ingresá un importe negativo. Las ventas, devoluciones y cobranzas en efectivo se registran
              automáticamente en la caja abierta.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th>Esperado</th>
                    <th>Contado</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.cajas.map((c) => (
                    <tr key={c.sesionId}>
                      <td>{formatDateTime(c.abiertaEn)}</td>
                      <td>{c.cerradaEn ? formatDateTime(c.cerradaEn) : "Abierta"}</td>
                      <td>{formatMoney(c.abierta ? (datos.caja?.esperado ?? c.esperado) : c.esperado)}</td>
                      <td>{c.contado === undefined ? "—" : formatMoney(c.contado)}</td>
                      <td>{c.diferencia === undefined ? "—" : formatMoney(c.diferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card id="proveedores">
          <CardHeader>
            <CardTitle>Proveedores</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo titulo="Nombre / razón social" value={nombre} onChange={setNombre} />
              <Campo titulo="CUIT / documento" value={documento} onChange={setDocumento} />
              <Campo titulo="Teléfono" value={telefono} onChange={setTelefono} />
            </div>
            <Button
              className="w-fit"
              onClick={() =>
                void ejecutar(
                  { accion: "proveedor", proveedor: { id: proveedorEditado, nombre, documento, telefono } },
                  () => {
                    setNombre("");
                    setDocumento("");
                    setTelefono("");
                    setProveedorEditado(crypto.randomUUID());
                  },
                )
              }
            >
              Guardar proveedor
            </Button>
            <ul className="grid gap-1 text-sm">
              {datos.proveedores.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3">
                  {p.nombre} · {p.documento || "Sin documento"} · {p.telefono} · Saldo: {formatMoney(p.saldo ?? 0)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProveedorEditado(p.id);
                      setNombre(p.nombre);
                      setDocumento(p.documento);
                      setTelefono(p.telefono);
                    }}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card id="compras">
          <CardHeader>
            <CardTitle>Recibir compra</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="grid gap-2">
                Proveedor
                <select className={selectClass} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Elegir proveedor</option>
                  {datos.proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Label>
              <Campo titulo="Número de comprobante" value={comprobante} onChange={setComprobante} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Label className="grid gap-2">
                Artículo
                <select
                  className={selectClass}
                  value={articuloId}
                  onChange={(e) => {
                    setArticuloId(e.target.value);
                    setCosto(String((articulos.find((a) => a.id === e.target.value)?.costo ?? 0) / 100));
                  }}
                >
                  <option value="">Elegir artículo</option>
                  {articulos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} · {a.nombre}
                    </option>
                  ))}
                </select>
              </Label>
              <Campo titulo="Cantidad recibida" tipo="number" value={cantidad} onChange={setCantidad} />
              <Campo titulo="Costo unitario neto ($)" tipo="number" value={costo} onChange={setCosto} />
            </div>
            <Button
              variant="outline"
              className="w-fit"
              disabled={!articuloId}
              onClick={() => {
                if (lineas.some((l) => l.articuloId === articuloId)) {
                  toast.error("El artículo ya está agregado");
                  return;
                }
                setLineas([
                  ...lineas,
                  { articuloId, cantidad: Math.round(Number(cantidad) * 1000), costo: pesos(costo) },
                ]);
              }}
            >
              Agregar a la compra
            </Button>
            <ul className="grid gap-2 text-sm">
              {lineas.map((l) => (
                <li className="flex items-center gap-3" key={l.articuloId}>
                  {articulos.find((a) => a.id === l.articuloId)?.nombre} · {formatQty(l.cantidad)} ×{" "}
                  {formatMoney(l.costo)}{" "}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLineas(lineas.filter((x) => x.articuloId !== l.articuloId))}
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
            <p>
              Total con IVA de los artículos:{" "}
              <strong>
                {formatMoney(
                  lineas.reduce(
                    (s, l) =>
                      s +
                      Math.round((l.costo * l.cantidad) / 1000) +
                      Math.round(
                        (Math.round((l.costo * l.cantidad) / 1000) *
                          (articulos.find((a) => a.id === l.articuloId)?.alicuotaIva ?? 0)) /
                          10000,
                      ),
                    0,
                  ),
                )}
              </strong>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo titulo="Pago inicial ($; 0 = compra a cuenta)" tipo="number" value={pagado} onChange={setPagado} />
              <Label className="grid gap-2">
                Medio de pago
                <select className={selectClass} value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
                  {["transferencia", "efectivo", "debito", "credito"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <Button
              className="w-fit"
              disabled={!lineas.length || !proveedorId || !comprobante}
              onClick={() =>
                void ejecutar(
                  { accion: "compra", proveedorId, comprobante, lineas, pagado: pesos(pagado), medio },
                  () => {
                    setLineas([]);
                    setComprobante("");
                    setPagado("0");
                  },
                )
              }
            >
              Registrar recepción y actualizar costos
            </Button>
            <h3 className="font-semibold">Compras y saldos pendientes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Proveedor</th>
                    <th>Comprobante</th>
                    <th>Total</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.compras.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDateTime(c.fecha)}</td>
                      <td>{datos.proveedores.find((p) => p.id === c.proveedorId)?.nombre}</td>
                      <td>{c.comprobante}</td>
                      <td>{formatMoney(c.total)}</td>
                      <td>{formatMoney(c.total - c.pagado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" disabled={!antes} onClick={() => setAntes("")}>
                Más recientes
              </Button>
              <Button variant="outline" disabled={!datos.siguiente} onClick={() => setAntes(datos.siguiente ?? "")}>
                Anteriores
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="grid gap-2">
                Compra a pagar
                <select className={selectClass} value={compraId} onChange={(e) => setCompraId(e.target.value)}>
                  <option value="">Elegir compra de esta página</option>
                  {datos.compras
                    .filter((c) => c.total > c.pagado)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.comprobante} · {formatMoney(c.total - c.pagado)}
                      </option>
                    ))}
                </select>
              </Label>
              <Campo titulo="Importe a pagar ($)" tipo="number" value={pagoProveedor} onChange={setPagoProveedor} />
            </div>
            <Button
              className="w-fit"
              disabled={!compraId}
              onClick={() =>
                void ejecutar({ accion: "pago_proveedor", compraId, importe: pesos(pagoProveedor), medio })
              }
            >
              Registrar pago al proveedor ({medio})
            </Button>
          </CardContent>
        </Card>
        <Card id="inventario">
          <CardHeader>
            <CardTitle>Conteo de inventario</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Label className="grid gap-2">
              Artículo
              <select
                className={selectClass}
                value={inventarioId}
                onChange={(e) => {
                  setInventarioId(e.target.value);
                  const stock = articulos.find((a) => a.id === e.target.value)?.stock ?? 0;
                  setStockAlContar(stock);
                  setContado(String(stock / 1000));
                }}
              >
                <option value="">Elegir artículo</option>
                {articulos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} · {a.nombre}
                  </option>
                ))}
              </select>
            </Label>
            {articuloInventario && (
              <p>
                Stock del sistema: <strong>{formatQty(articuloInventario.stock)}</strong>
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo titulo="Cantidad contada" tipo="number" value={contado} onChange={setContado} />
              <Campo titulo="Motivo del ajuste" value={motivoInventario} onChange={setMotivoInventario} />
            </div>
            {articuloInventario && articuloInventario.stock !== stockAlContar && (
              <p role="alert">El stock cambió durante el conteo. Elegí nuevamente el artículo para actualizarlo.</p>
            )}
            <Button
              className="w-fit"
              disabled={!articuloInventario || articuloInventario.stock !== stockAlContar}
              onClick={() =>
                articuloInventario &&
                void ejecutar({
                  accion: "inventario",
                  articuloId: inventarioId,
                  esperado: stockAlContar,
                  contado: Math.round(Number(contado) * 1000),
                  motivo: motivoInventario,
                })
              }
            >
              Confirmar conteo
            </Button>
            <ul className="grid gap-2 text-sm">
              {datos.inventario.map((m) => (
                <li key={m.id}>
                  {formatDateTime(m.fecha)} · {articulos.find((a) => a.id === m.articuloId)?.nombre ?? m.articuloId} ·{" "}
                  {formatQty(m.delta)} · {m.motivo}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </fieldset>
    </div>
  );
}
