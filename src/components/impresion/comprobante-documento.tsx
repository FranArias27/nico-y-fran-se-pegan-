import { LEYENDA_TRANSPARENCIA_FISCAL } from "@/domain/comprobante";
import { porcentaje } from "@/domain/dinero";
import {
  ETIQUETA_ALICUOTA,
  ETIQUETA_CONDICION_IVA,
  ETIQUETA_MEDIO_PAGO,
  ETIQUETA_UNIDAD,
  type Comercio,
  type LineaVenta,
  type Venta,
} from "@/domain/types";
import {
  formatCuit,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumeroComprobante,
  formatQty,
} from "@/lib/format";
import { QrImage } from "./qr-image";
import type { FormatoImpresion } from "./impresion-provider";

const TITULO = { A: "FACTURA", B: "FACTURA", X: "NOTA DE PEDIDO" } as const;
const CODIGO = { A: "COD. 01", B: "COD. 06", X: "" } as const;

export const LEYENDA_DEMO = "Comprobante de demostración generado por un prototipo · Sin validez fiscal";

/** En Factura B los precios van con IVA incluido; en A y X, netos. */
function precioUnitario(venta: Venta, l: LineaVenta) {
  return venta.tipo === "B" ? l.precioFinal : l.precioNeto;
}

function importeLinea(venta: Venta, l: LineaVenta) {
  return venta.tipo === "B" ? l.total : l.neto;
}

function bonificacion(venta: Venta, l: LineaVenta) {
  if (l.descuentoNeto <= 0) return 0;
  return venta.tipo === "B" ? l.descuentoNeto + porcentaje(l.descuentoNeto, l.alicuotaIva) : l.descuentoNeto;
}

function documentoCliente(venta: Venta) {
  if (!venta.clienteDocumento) return "—";
  return venta.clienteDocumento.length === 11
    ? `CUIT ${formatCuit(venta.clienteDocumento)}`
    : `DNI ${venta.clienteDocumento}`;
}

function condicionVenta(venta: Venta) {
  return venta.pagos.some((p) => p.medio === "cuenta_corriente") ? "Cuenta corriente" : "Contado";
}

function Totales({ venta, compacto = false }: { venta: Venta; compacto?: boolean }) {
  const t = venta.totales;
  const fila = compacto ? "flex justify-between gap-2" : "flex justify-between gap-8";
  return (
    <div className="grid gap-0.5">
      {t.descuentos > 0 && (
        <div className={fila}>
          <span>Bonificaciones</span>
          <span>-{formatMoney(venta.lineas.reduce((s, l) => s + bonificacion(venta, l), 0))}</span>
        </div>
      )}
      {venta.tipo === "A" && (
        <>
          {t.ivaPorAlicuota.map((g) => (
            <div key={`n${g.alicuota}`} className={fila}>
              <span>Neto gravado {ETIQUETA_ALICUOTA[g.alicuota]}</span>
              <span>{formatMoney(g.neto)}</span>
            </div>
          ))}
          {t.ivaPorAlicuota
            .filter((g) => g.alicuota > 0)
            .map((g) => (
              <div key={`i${g.alicuota}`} className={fila}>
                <span>IVA {ETIQUETA_ALICUOTA[g.alicuota]}</span>
                <span>{formatMoney(g.iva)}</span>
              </div>
            ))}
        </>
      )}
      <div className={`${fila} border-t border-black pt-1 text-base font-bold`}>
        <span>TOTAL</span>
        <span>{formatMoney(t.total)}</span>
      </div>
      {venta.tipo === "B" && (
        <div className="mt-1 border border-black p-1 text-[10px] leading-tight">
          <p className="font-semibold">{LEYENDA_TRANSPARENCIA_FISCAL}</p>
          {t.ivaPorAlicuota
            .filter((g) => g.alicuota > 0)
            .map((g) => (
              <div key={g.alicuota} className="flex justify-between gap-2">
                <span>IVA contenido {ETIQUETA_ALICUOTA[g.alicuota]}</span>
                <span>{formatMoney(g.iva)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Pagos({ venta }: { venta: Venta }) {
  return (
    <div className="grid gap-0.5">
      {venta.pagos.map((p, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span>{ETIQUETA_MEDIO_PAGO[p.medio]}</span>
          <span>{formatMoney(p.importe)}</span>
        </div>
      ))}
      {venta.vuelto > 0 && (
        <div className="flex justify-between gap-2">
          <span>Su vuelto</span>
          <span>{formatMoney(venta.vuelto)}</span>
        </div>
      )}
    </div>
  );
}

function PieFiscal({ venta, qr }: { venta: Venta; qr: number }) {
  if (!venta.fiscal) {
    return <p className="text-center text-xs font-semibold">DOCUMENTO NO VÁLIDO COMO FACTURA</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <QrImage texto={venta.fiscal.qrUrl} tamano={qr} />
      <div className="text-xs leading-snug">
        <p className="font-semibold">ARCA · Comprobante autorizado</p>
        <p>CAE N.º {venta.fiscal.cae}</p>
        <p>Vto. CAE {formatDate(venta.fiscal.caeVencimiento + "T00:00:00")}</p>
      </div>
    </div>
  );
}

function DocumentoA4({ venta, comercio, vendedor }: { venta: Venta; comercio: Comercio; vendedor?: string }) {
  return (
    <div className="mx-auto w-full max-w-[186mm] bg-white text-[12px] text-black">
      <div className="relative grid grid-cols-2 border border-black">
        <div className="border-r border-black p-4 pr-10">
          <p className="text-xl font-bold">{comercio.nombreFantasia}</p>
          <p className="font-semibold">{comercio.razonSocial}</p>
          <p>{comercio.domicilio}</p>
          <p>{comercio.localidad}</p>
          <p>Tel. {comercio.telefono}</p>
          <p className="mt-1 font-semibold">IVA {ETIQUETA_CONDICION_IVA[comercio.condicionIva]}</p>
        </div>
        <div className="p-4 pl-10">
          <p className="text-xl font-bold">{TITULO[venta.tipo]}</p>
          <p className="font-semibold">N.º {formatNumeroComprobante(venta.puntoVenta, venta.numero)}</p>
          <p>Fecha: {formatDate(venta.fecha)}</p>
          <p className="mt-2">CUIT: {formatCuit(comercio.cuit)}</p>
          <p>Ingresos Brutos: {comercio.ingresosBrutos}</p>
          <p>Inicio de actividades: {formatDate(comercio.inicioActividades + "T00:00:00")}</p>
        </div>
        <div className="absolute top-0 left-1/2 flex w-14 -translate-x-1/2 flex-col items-center border-x border-b border-black bg-white py-1">
          <span className="text-3xl leading-none font-bold">{venta.tipo}</span>
          <span className="text-[9px]">{CODIGO[venta.tipo]}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 border-x border-b border-black p-3">
        <p>
          <span className="font-semibold">Cliente:</span> {venta.clienteNombre}
        </p>
        <p>
          <span className="font-semibold">{documentoCliente(venta)}</span>
        </p>
        <p>
          <span className="font-semibold">Condición IVA:</span> {ETIQUETA_CONDICION_IVA[venta.clienteCondicionIva]}
        </p>
        <p>
          <span className="font-semibold">Condición de venta:</span> {condicionVenta(venta)}
        </p>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1 pr-2">Código</th>
            <th className="py-1 pr-2">Descripción</th>
            <th className="py-1 pr-2 text-right">Cant.</th>
            <th className="py-1 pr-2">U. M.</th>
            <th className="py-1 pr-2 text-right">Precio unit.</th>
            <th className="py-1 pr-2 text-right">Bonif.</th>
            {venta.tipo === "A" && <th className="py-1 pr-2 text-right">IVA</th>}
            <th className="py-1 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {venta.lineas.map((l) => (
            <tr key={l.articuloId} className="border-b border-black/20 align-top">
              <td className="py-1 pr-2">{l.codigo}</td>
              <td className="py-1 pr-2">{l.descripcion}</td>
              <td className="py-1 pr-2 text-right">{formatQty(l.cantidad)}</td>
              <td className="py-1 pr-2">{ETIQUETA_UNIDAD[l.unidad].corta}</td>
              <td className="py-1 pr-2 text-right">{formatMoney(precioUnitario(venta, l))}</td>
              <td className="py-1 pr-2 text-right">{bonificacion(venta, l) > 0 ? formatMoney(bonificacion(venta, l)) : ""}</td>
              {venta.tipo === "A" && <td className="py-1 pr-2 text-right">{ETIQUETA_ALICUOTA[l.alicuotaIva]}</td>}
              <td className="py-1 text-right">{formatMoney(importeLinea(venta, l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="text-xs">
          <p className="mb-1 font-semibold">Forma de pago</p>
          <Pagos venta={venta} />
          {vendedor && <p className="mt-2">Atendió: {vendedor}</p>}
        </div>
        <div className="min-w-72">
          <Totales venta={venta} />
        </div>
      </div>

      <div className="mt-6 border-t border-black pt-3">
        <PieFiscal venta={venta} qr={96} />
      </div>
      <p className="mt-4 text-center text-[10px] text-black/60">{LEYENDA_DEMO}</p>
    </div>
  );
}

function DocumentoTicket({ venta, comercio, vendedor }: { venta: Venta; comercio: Comercio; vendedor?: string }) {
  return (
    <div className="mx-auto w-[72mm] bg-white font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <p className="text-sm font-bold">{comercio.nombreFantasia}</p>
        <p>{comercio.razonSocial}</p>
        <p>CUIT {formatCuit(comercio.cuit)}</p>
        <p>IIBB {comercio.ingresosBrutos}</p>
        <p>{comercio.domicilio}</p>
        <p>{comercio.localidad}</p>
        <p>IVA {ETIQUETA_CONDICION_IVA[comercio.condicionIva]}</p>
        <p>Inicio act. {formatDate(comercio.inicioActividades + "T00:00:00")}</p>
      </div>
      <div className="my-2 border-y border-dashed border-black py-1 text-center">
        <p className="text-sm font-bold">
          {TITULO[venta.tipo]} {venta.tipo} {CODIGO[venta.tipo] && `(${CODIGO[venta.tipo]})`}
        </p>
        <p>N.º {formatNumeroComprobante(venta.puntoVenta, venta.numero)}</p>
        <p>{formatDateTime(venta.fecha)}</p>
      </div>
      <div>
        <p>{venta.clienteNombre}</p>
        {venta.clienteDocumento && <p>{documentoCliente(venta)}</p>}
        <p>{ETIQUETA_CONDICION_IVA[venta.clienteCondicionIva]}</p>
        <p>Cond. venta: {condicionVenta(venta)}</p>
      </div>
      <div className="my-2 border-t border-dashed border-black pt-1">
        {venta.lineas.map((l) => (
          <div key={l.articuloId} className="mb-1">
            <p>{l.descripcion}</p>
            <div className="flex justify-between gap-2">
              <span>
                {formatQty(l.cantidad)} {ETIQUETA_UNIDAD[l.unidad].corta} x {formatMoney(precioUnitario(venta, l))}
                {venta.tipo === "A" && ` (${ETIQUETA_ALICUOTA[l.alicuotaIva]})`}
              </span>
              <span>{formatMoney(importeLinea(venta, l) + bonificacion(venta, l))}</span>
            </div>
            {bonificacion(venta, l) > 0 && (
              <div className="flex justify-between gap-2">
                <span>Bonificación</span>
                <span>-{formatMoney(bonificacion(venta, l))}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-black pt-1">
        <Totales venta={venta} compacto />
      </div>
      <div className="mt-2 border-t border-dashed border-black pt-1">
        <Pagos venta={venta} />
      </div>
      {vendedor && <p className="mt-1">Atendió: {vendedor}</p>}
      <div className="mt-2 border-t border-dashed border-black pt-2">
        <PieFiscal venta={venta} qr={88} />
      </div>
      <p className="mt-2 text-center">¡Gracias por su compra!</p>
      <p className="mt-1 text-center text-[9px]">{LEYENDA_DEMO}</p>
    </div>
  );
}

export function ComprobanteDocumento({
  venta,
  comercio,
  formato,
  vendedor,
}: {
  venta: Venta;
  comercio: Comercio;
  formato: FormatoImpresion;
  vendedor?: string;
}) {
  return formato === "a4" ? (
    <DocumentoA4 venta={venta} comercio={comercio} vendedor={vendedor} />
  ) : (
    <DocumentoTicket venta={venta} comercio={comercio} vendedor={vendedor} />
  );
}
