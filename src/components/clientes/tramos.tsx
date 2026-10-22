import { ETIQUETA_TRAMO, TRAMOS, type DeudaPorTramo, type Tramo } from "@/domain/cuenta-corriente";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Color por tramo: de neutro (al día) a rojo (más de 30 días). */
export const COLOR_TRAMO: Record<Tramo, string> = {
  al_dia: "var(--tramo-0)",
  "1_7": "var(--tramo-1)",
  "8_15": "var(--tramo-2)",
  "16_30": "var(--tramo-3)",
  mas_30: "var(--tramo-4)",
};

/** Deuda por tramo de antigüedad, como una fila de casilleros. */
export function TramosDeuda({ tramos, className }: { tramos: DeudaPorTramo; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-5", className)}>
      {TRAMOS.map((t) => (
        <div key={t} className={cn("rounded-xl border p-3", tramos[t] === 0 && "opacity-50")}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ background: COLOR_TRAMO[t] }} />
            {t === "al_dia" ? "Al día" : `Vencido ${ETIQUETA_TRAMO[t].toLowerCase()}`}
          </div>
          <p className="tabular mt-1 font-semibold">{formatMoney(tramos[t])}</p>
        </div>
      ))}
    </div>
  );
}
