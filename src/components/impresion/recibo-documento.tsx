import { ETIQUETA_CONDICION_IVA, ETIQUETA_MEDIO_PAGO, type Comercio, type Recibo } from "@/domain/types";
import { formatCuit, formatDateTime, formatMoney, formatNumeroComprobante } from "@/lib/format";
import type { FormatoImpresion } from "./impresion-provider";
import { LEYENDA_DEMO } from "./comprobante-documento";

export function ReciboDocumento({
  recibo,
  comercio,
  saldoRestante,
  formato,
}: {
  recibo: Recibo;
  comercio: Comercio;
  saldoRestante?: number;
  formato: FormatoImpresion;
}) {
  const ticket = formato === "ticket";
  return (
    <div className={ticket ? "mx-auto w-[72mm] font-mono text-[11px] text-black" : "mx-auto max-w-[186mm] text-[12px] text-black"}>
      <div className={ticket ? "text-center" : "flex items-start justify-between border-b border-black pb-3"}>
        <div>
          <p className={ticket ? "text-sm font-bold" : "text-xl font-bold"}>{comercio.nombreFantasia}</p>
          <p>{comercio.razonSocial}</p>
          <p>CUIT {formatCuit(comercio.cuit)} · IVA {ETIQUETA_CONDICION_IVA[comercio.condicionIva]}</p>
          <p>
            {comercio.domicilio}, {comercio.localidad}
          </p>
        </div>
        <div className={ticket ? "my-2 border-y border-dashed border-black py-1" : "text-right"}>
          <p className={ticket ? "text-sm font-bold" : "text-xl font-bold"}>RECIBO</p>
          <p>N.º {formatNumeroComprobante(recibo.puntoVenta, recibo.numero)}</p>
          <p>{formatDateTime(recibo.fecha)}</p>
        </div>
      </div>

      <p className="mt-3">
        Recibimos de <span className="font-semibold">{recibo.clienteNombre}</span> la suma de{" "}
        <span className="font-semibold">{formatMoney(recibo.importe)}</span> en concepto de pago de cuenta corriente,
        mediante {ETIQUETA_MEDIO_PAGO[recibo.medio].toLowerCase()}.
      </p>

      <p className="mt-3 font-semibold">Imputación</p>
      <div className={ticket ? "" : "border-t border-black"}>
        {recibo.imputaciones.map((i) => (
          <div key={i.debitoId} className="flex justify-between gap-2 border-b border-black/20 py-1">
            <span>{i.descripcion}</span>
            <span>{formatMoney(i.importe)}</span>
          </div>
        ))}
        {recibo.saldoAFavor > 0 && (
          <div className="flex justify-between gap-2 border-b border-black/20 py-1">
            <span>Saldo a favor</span>
            <span>{formatMoney(recibo.saldoAFavor)}</span>
          </div>
        )}
        <div className="flex justify-between gap-2 pt-1 font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(recibo.importe)}</span>
        </div>
      </div>

      {saldoRestante !== undefined && (
        <p className="mt-3">
          {saldoRestante >= 0
            ? `Saldo pendiente luego de este pago: ${formatMoney(saldoRestante)}`
            : `Saldo a favor del cliente: ${formatMoney(-saldoRestante)}`}
        </p>
      )}

      <div className={ticket ? "mt-6 text-center" : "mt-12 flex justify-end"}>
        <div className="w-48 border-t border-black pt-1 text-center">Firma y aclaración</div>
      </div>
      <p className="mt-4 text-center text-[9px] text-black/60">{LEYENDA_DEMO}</p>
    </div>
  );
}
