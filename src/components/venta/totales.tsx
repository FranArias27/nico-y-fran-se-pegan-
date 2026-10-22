import { LEYENDA_TRANSPARENCIA_FISCAL } from "@/domain/comprobante";
import { ETIQUETA_ALICUOTA, type TipoComprobante, type TotalesComprobante } from "@/domain/types";
import { formatMoney } from "@/lib/format";

function Fila({ etiqueta, valor, tenue }: { etiqueta: React.ReactNode; valor: number; tenue?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${tenue ? "text-muted-foreground" : ""}`}>
      <span>{etiqueta}</span>
      <span className="tabular">{formatMoney(valor)}</span>
    </div>
  );
}

/** Desglose de totales según el comprobante (A: IVA discriminado; B: contenido; C: sin discriminar; X: sin IVA). */
export function Totales({ tipo, totales }: { tipo: TipoComprobante; totales: TotalesComprobante }) {
  const gravados = totales.ivaPorAlicuota.filter((g) => g.alicuota > 0);
  return (
    <div className="grid gap-1.5">
      {tipo !== "C" && <Fila etiqueta="Subtotal neto" valor={totales.netoBruto} tenue />}
      {tipo !== "C" && totales.descuentos > 0 && <Fila etiqueta="Descuentos" valor={-totales.descuentos} tenue />}
      {tipo === "C" && <p className="text-xs text-muted-foreground">Factura C: el IVA no se discrimina.</p>}
      {tipo === "A" &&
        gravados.map((g) => <Fila key={g.alicuota} etiqueta={`IVA ${ETIQUETA_ALICUOTA[g.alicuota]}`} valor={g.iva} tenue />)}
      {tipo === "X" && <p className="text-xs text-muted-foreground">Nota de pedido: sin IVA.</p>}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2">
        <span className="font-medium">Total</span>
        <span className="tabular text-3xl font-bold tracking-tight">{formatMoney(totales.total)}</span>
      </div>
      {tipo === "B" && gravados.length > 0 && (
        <div className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
          {gravados.map((g) => (
            <div key={g.alicuota} className="flex justify-between">
              <span>IVA contenido {ETIQUETA_ALICUOTA[g.alicuota]}</span>
              <span className="tabular">{formatMoney(g.iva)}</span>
            </div>
          ))}
          <p className="mt-1 leading-tight">{LEYENDA_TRANSPARENCIA_FISCAL}</p>
        </div>
      )}
    </div>
  );
}
