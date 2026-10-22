"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ClockIcon, PauseIcon, UserRoundIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { MEDIOS_COBRO } from "@/domain/cobro";
import { DescuentoEditor } from "@/components/common/descuento-editor";
import { EstadoClienteBadge } from "@/components/common/estado-cliente-badge";
import { Kbd } from "@/components/common/kbd";
import { Money } from "@/components/common/money";
import { useServicios } from "@/components/providers/servicios-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { agregarAlCarrito, armarLineas, cambiarCantidad, cambiarDescuentoItem, quitarDelCarrito } from "@/domain/carrito";
import { indexarCodigos } from "@/domain/codigos";
import { comprobantesDisponibles } from "@/domain/comprobante";
import {
  CLIENTE_CONSUMIDOR_FINAL_ID,
  ETIQUETA_COMPROBANTE,
  ETIQUETA_CONDICION_IVA,
  type Articulo,
  type Cliente,
  type Milesimas,
  type Pago,
  type TipoComprobante,
  type Venta,
} from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import { formatCuit, formatMoney, formatQty } from "@/lib/format";
import { ErrorDeNegocio } from "@/services";
import { Buscador } from "./buscador";
import { Carrito } from "./carrito";
import { ClienteSelector } from "./cliente-selector";
import { CobroDialog } from "./cobro-dialog";
import { EnEsperaSheet } from "./en-espera-sheet";
import { Totales } from "./totales";
import { useVentaActual } from "./venta-actual";
import { VentaExitosaDialog } from "./venta-exitosa-dialog";

const ATAJOS = [
  ["F2", "Buscar"],
  ["F4", "Cliente"],
  ["F8", "En espera"],
  ["F12", "Cobrar"],
  ["Esc", "Cancelar"],
] as const;

function esCampoDeTexto(el: Element | null) {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

function TarjetaCliente({ cliente, saldo, onCambiar }: { cliente: Cliente; saldo?: number; onCambiar: () => void }) {
  const disponible = cliente.limiteCredito - (saldo ?? 0);
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRoundIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{cliente.razonSocial}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ETIQUETA_CONDICION_IVA[cliente.condicionIva]}
            {cliente.documento &&
              ` · ${cliente.documento.length === 11 ? formatCuit(cliente.documento) : `DNI ${cliente.documento}`}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onCambiar}>
          Cambiar <Kbd className="hidden md:inline-flex">F4</Kbd>
        </Button>
      </div>
      {cliente.id !== CLIENTE_CONSUMIDOR_FINAL_ID && (cliente.cuentaCorriente || cliente.estado !== "habilitado") && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs">
          {cliente.estado !== "habilitado" && <EstadoClienteBadge estado={cliente.estado} />}
          {cliente.cuentaCorriente && saldo !== undefined && (
            <>
              <span>
                Saldo <Money value={saldo} className="font-semibold" />
              </span>
              <span className={disponible < 0 ? "text-destructive" : "text-muted-foreground"}>
                Disponible <Money value={Math.max(disponible, 0)} />
              </span>
            </>
          )}
          <Link href={`/clientes/${cliente.id}`} className="ml-auto text-primary hover:underline">
            Ver cuenta
          </Link>
        </div>
      )}
    </div>
  );
}

export function VentaView() {
  const servicios = useServicios();
  const { usuario, puede, empresa } = useAuth();
  const demo = empresa?.demo === true;
  const { venta, actualizar, reiniciar } = useVentaActual();

  const { datos: articulos } = useConsulta((s) => s.articulos.listar());
  const { datos: clientes } = useConsulta((s) => s.clientes.listar());
  const { datos: comercio } = useConsulta((s) => s.demo.obtenerComercio());
  const { datos: enEspera = [] } = useConsulta((s) => s.ventas.listarEnEspera());
  const { datos: cuenta } = useConsulta((s) => s.cuentaCorriente.deCliente(venta.clienteId), [venta.clienteId]);

  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [cobroAbierto, setCobroAbierto] = useState(false);
  const [esperaAbierta, setEsperaAbierta] = useState(false);
  const [cancelarAbierto, setCancelarAbierto] = useState(false);
  const [ventaExitosa, setVentaExitosa] = useState<Venta | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  // Momento en que se cerró el último diálogo: el Esc que lo cierra no debe cancelar la venta.
  const cierreDialogo = useRef(0);

  const mapa = useMemo(() => new Map((articulos ?? []).map((a) => [a.id, a])), [articulos]);
  const indice = useMemo(() => indexarCodigos(articulos ?? []), [articulos]);
  const cliente =
    clientes?.find((c) => c.id === venta.clienteId) ?? clientes?.find((c) => c.id === CLIENTE_CONSUMIDOR_FINAL_ID);

  // Una empresa real factura recién con el certificado de ARCA cargado; antes, solo nota de pedido.
  const factura = demo || !!comercio?.certificadoArca;
  const tipos: TipoComprobante[] = (
    comercio && cliente ? comprobantesDisponibles(comercio.condicionIva, cliente.condicionIva) : (["B", "X"] as TipoComprobante[])
  ).filter((t) => t === "X" || factura);
  const tipo = venta.tipo && tipos.includes(venta.tipo) ? venta.tipo : tipos[0];

  // Se calcula para cada comprobante posible: el modal de cobro muestra ambos totales.
  const calculos = {} as Record<TipoComprobante, ReturnType<typeof armarLineas>>;
  for (const t of tipos) calculos[t] = armarLineas(t, venta.items, mapa, venta.descuentoTotal);
  const actual = calculos[tipo];
  const totalesPorTipo = Object.fromEntries(tipos.map((t) => [t, calculos[t].calculo.totales.total])) as Record<
    TipoComprobante,
    number
  >;

  const hayDialogo = clienteAbierto || cobroAbierto || esperaAbierta || cancelarAbierto || ventaExitosa !== null;

  function enfocarBuscador() {
    requestAnimationFrame(() => buscadorRef.current?.focus());
  }

  // --- Acciones -------------------------------------------------------------

  function agregar(art: Articulo, cantidad: Milesimas) {
    const enCarrito = venta.items.find((i) => i.articuloId === art.id)?.cantidad ?? 0;
    if (art.stock - (enCarrito + cantidad) < 0) {
      toast.warning(`Sin stock suficiente de ${art.nombre}`, {
        id: `stock-${art.id}`,
        description: `Stock actual: ${formatQty(art.stock)}. Se puede vender igual; el stock queda negativo.`,
      });
    }
    actualizar((v) => ({ ...v, items: agregarAlCarrito(v.items, art.id, cantidad), ultimoArticuloId: art.id }));
  }

  function elegirCliente(c: Cliente) {
    actualizar((v) => ({ ...v, clienteId: c.id, tipo: null }));
    setClienteAbierto(false);
    if (c.estado === "bloqueado") toast.warning(`${c.razonSocial} está bloqueado: solo se le puede vender al contado.`);
    else if (c.estado === "observacion") toast.warning(`${c.razonSocial} está en observación.`);
    enfocarBuscador();
  }

  function abrirCobro() {
    if (venta.items.length === 0) {
      toast.info("Agregá al menos un artículo para cobrar.");
      return;
    }
    setCobroAbierto(true);
  }

  async function confirmarCobro(pagos: Pago[]) {
    try {
      const registrada = await servicios.ventas.registrar({
        tipo,
        clienteId: cliente!.id,
        items: venta.items,
        descuentoTotal: venta.descuentoTotal,
        pagos,
        vendedorId: usuario.id,
        vendedorNombre: usuario.nombre,
      });
      setCobroAbierto(false);
      reiniciar();
      setVentaExitosa(registrada);
    } catch (e) {
      toast.error(e instanceof ErrorDeNegocio ? e.message : "No se pudo registrar la venta");
      if (!(e instanceof ErrorDeNegocio)) console.error(e);
    }
  }

  async function ponerEnEspera(silencioso = false) {
    if (venta.items.length === 0) {
      if (!silencioso) toast.info("No hay una venta en curso para poner en espera.");
      return;
    }
    await servicios.ventas.ponerEnEspera({
      usuarioId: usuario.id,
      clienteId: cliente?.id ?? CLIENTE_CONSUMIDOR_FINAL_ID,
      etiqueta: `${cliente?.razonSocial ?? "Consumidor final"} · ${formatMoney(actual.calculo.totales.total)}`,
      items: venta.items,
      descuentoTotal: venta.descuentoTotal,
    });
    reiniciar();
    if (!silencioso) toast.success("Venta en espera. Retomala desde «En espera».");
    enfocarBuscador();
  }

  async function retomar(id: string) {
    await ponerEnEspera(true);
    const v = await servicios.ventas.retomarEnEspera(id);
    if (v) actualizar(() => ({ items: v.items, clienteId: v.clienteId, descuentoTotal: v.descuentoTotal, tipo: null }));
    setEsperaAbierta(false);
    enfocarBuscador();
  }

  // --- Teclado ---------------------------------------------------------------

  const acciones = useRef({ abrirCobro, ponerEnEspera, hayDialogo, hayItems: venta.items.length > 0 });
  useEffect(() => {
    acciones.current = { abrirCobro, ponerEnEspera, hayDialogo, hayItems: venta.items.length > 0 };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const a = acciones.current;
      if (e.key === "F2") {
        e.preventDefault();
        if (!a.hayDialogo) {
          buscadorRef.current?.focus();
          buscadorRef.current?.select();
        }
      } else if (e.key === "F4") {
        e.preventDefault();
        if (!a.hayDialogo) setClienteAbierto(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        if (!a.hayDialogo) void a.ponerEnEspera();
      } else if (e.key === "F12") {
        e.preventDefault();
        if (!a.hayDialogo) a.abrirCobro();
      } else if (e.key === "Escape") {
        if (!a.hayDialogo && a.hayItems && Date.now() - cierreDialogo.current > 300) setCancelarAbierto(true);
      } else if (
        !a.hayDialogo &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !esCampoDeTexto(document.activeElement)
      ) {
        // Foco permanente: cualquier tecla (o el lector) escribe en el campo de código.
        buscadorRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Si el foco queda "suelto" (clic en un espacio vacío), vuelve al campo de código.
  useEffect(() => {
    function onFocusOut() {
      setTimeout(() => {
        if (acciones.current.hayDialogo) return;
        const activo = document.activeElement;
        if (!activo || activo === document.body) buscadorRef.current?.focus();
      }, 0);
    }
    document.addEventListener("focusout", onFocusOut);
    return () => document.removeEventListener("focusout", onFocusOut);
  }, []);

  useEffect(() => {
    if (!hayDialogo) {
      cierreDialogo.current = Date.now();
      enfocarBuscador();
    }
  }, [hayDialogo]);

  // --- Render ----------------------------------------------------------------

  if (!articulos || !clientes || !comercio || !cliente) {
    return (
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_24rem] md:p-6">
        <div className="grid gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totales = actual.calculo.totales;

  return (
    <div className="flex flex-col md:h-[calc(100dvh-3.5rem)] md:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:overflow-hidden md:p-6">
        <Buscador ref={buscadorRef} articulos={articulos} indice={indice} onAgregar={agregar} />
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
          {ATAJOS.map(([tecla, accion]) => (
            <span key={tecla} className="flex items-center gap-1.5">
              <Kbd>{tecla}</Kbd> {accion}
            </span>
          ))}
          <span className="ml-auto">
            {venta.items.length > 0 &&
              `${venta.items.length} ${venta.items.length === 1 ? "artículo" : "artículos"}`}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
          <Carrito
            lineas={actual.lineas}
            articulos={mapa}
            ultimoArticuloId={venta.ultimoArticuloId}
            puedeDescontar={puede("aplicarDescuentos")}
            onCantidad={(id, c) => actualizar((v) => ({ ...v, items: cambiarCantidad(v.items, id, c) }))}
            onDescuento={(id, d) => actualizar((v) => ({ ...v, items: cambiarDescuentoItem(v.items, id, d) }))}
            onQuitar={(id) => actualizar((v) => ({ ...v, items: quitarDelCarrito(v.items, id) }))}
            onListo={enfocarBuscador}
          />
        </div>
      </section>

      <aside className="flex flex-col gap-4 border-t bg-muted/30 p-4 md:w-96 md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-l md:p-6">
        <TarjetaCliente
          cliente={cliente}
          saldo={cuenta?.cliente.id === cliente.id ? cuenta.resumen.saldo : undefined}
          onCambiar={() => setClienteAbierto(true)}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Comprobante</span>
            <Badge variant="outline">{ETIQUETA_COMPROBANTE[tipo]}</Badge>
            {!factura && (
              <span className="text-xs text-muted-foreground">Para facturar, cargá el certificado de ARCA en Configuración</span>
            )}
          </div>
          {puede("aplicarDescuentos") && (
            <DescuentoEditor
              valor={venta.descuentoTotal}
              onCambio={(d) => actualizar((v) => ({ ...v, descuentoTotal: d }))}
              etiqueta="Descuento al total"
            />
          )}
        </div>

        <Totales tipo={tipo} totales={totales} />

        <div className="mt-auto grid gap-2">
          <Button size="lg" className="h-14 text-lg" onClick={abrirCobro} disabled={venta.items.length === 0}>
            Cobrar <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">F12</Kbd>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void ponerEnEspera()} disabled={venta.items.length === 0}>
              <PauseIcon /> En espera
            </Button>
            <Button variant="outline" onClick={() => setEsperaAbierta(true)}>
              <ClockIcon /> Retomar
              {enEspera.length > 0 && <Badge className="ml-1">{enEspera.length}</Badge>}
            </Button>
          </div>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setCancelarAbierto(true)}
            disabled={venta.items.length === 0}
          >
            <XIcon /> Cancelar venta
          </Button>
        </div>
      </aside>

      {/* Barra fija de cobro en el celular */}
      {venta.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Total · {ETIQUETA_COMPROBANTE[tipo]}</p>
            <Money value={totales.total} className="text-xl font-bold" />
          </div>
          <Button size="lg" className="h-11 px-6" onClick={abrirCobro}>
            Cobrar
          </Button>
        </div>
      )}

      <ClienteSelector
        abierto={clienteAbierto}
        onAbierto={setClienteAbierto}
        clientes={clientes}
        seleccionadoId={cliente.id}
        onElegir={elegirCliente}
      />

      <CobroDialog
        abierto={cobroAbierto}
        onAbierto={setCobroAbierto}
        tipos={tipos}
        tipo={tipo}
        onTipo={(t) => actualizar((v) => ({ ...v, tipo: t }))}
        totales={totalesPorTipo}
        cliente={cliente}
        saldoCliente={cuenta?.cliente.id === cliente.id ? cuenta.resumen.saldo : 0}
        medios={demo ? MEDIOS_COBRO : MEDIOS_COBRO.filter((m) => m !== "qr")}
        onConfirmar={confirmarCobro}
      />

      <EnEsperaSheet
        abierto={esperaAbierta}
        onAbierto={setEsperaAbierta}
        ventas={enEspera}
        onRetomar={retomar}
        onDescartar={(id) => void servicios.ventas.descartarEnEspera(id)}
      />

      <Dialog open={cancelarAbierto} onOpenChange={setCancelarAbierto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cancelar la venta?</DialogTitle>
            <DialogDescription>Se quitan todos los artículos cargados.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Volver</Button>
            </DialogClose>
            <Button
              autoFocus
              variant="destructive"
              onClick={() => {
                reiniciar();
                setCancelarAbierto(false);
              }}
            >
              Sí, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VentaExitosaDialog venta={ventaExitosa} comercio={comercio} onCerrar={() => setVentaExitosa(null)} />
    </div>
  );
}
