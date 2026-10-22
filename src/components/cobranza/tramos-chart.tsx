"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLOR_TRAMO } from "@/components/clientes/tramos";
import { ETIQUETA_TRAMO, TRAMOS, type DeudaPorTramo } from "@/domain/cuenta-corriente";
import { formatMoney } from "@/lib/format";

/** Importe abreviado para ejes y etiquetas: $ 1,2 M, $ 850 mil. */
export function formatCorto(centavos: number): string {
  const pesos = centavos / 100;
  if (Math.abs(pesos) >= 1_000_000) return `$ ${(pesos / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(pesos) >= 1_000) return `$ ${Math.round(pesos / 1_000)} mil`;
  return `$ ${Math.round(pesos)}`;
}

const CORTA: Record<(typeof TRAMOS)[number], string> = {
  al_dia: "Al día",
  "1_7": "1–7 d",
  "8_15": "8–15 d",
  "16_30": "16–30 d",
  mas_30: "+30 d",
};

interface Dato {
  tramo: (typeof TRAMOS)[number];
  etiqueta: string;
  corta: string;
  importe: number;
}

function Ayuda({ active, payload }: { active?: boolean; payload?: { payload: Dato }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2.5 rounded-sm" style={{ background: COLOR_TRAMO[d.tramo] }} />
        {d.etiqueta}
      </p>
      <p className="tabular font-semibold">{formatMoney(d.importe)}</p>
    </div>
  );
}

/** Etiqueta sobre la barra, en una sola línea (Recharts la partiría al ancho de la barra). */
function EtiquetaBarra(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
  const y = Number(props.y ?? 0) - 8;
  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--foreground)" fontSize={12} fontWeight={500}>
      {formatCorto(Number(props.value ?? 0))}
    </text>
  );
}

export function TramosChart({ tramos }: { tramos: DeudaPorTramo }) {
  const datos: Dato[] = TRAMOS.map((t) => ({
    tramo: t,
    etiqueta: t === "al_dia" ? "Al día" : `Vencido ${ETIQUETA_TRAMO[t].toLowerCase()}`,
    corta: CORTA[t],
    importe: tramos[t],
  }));

  return (
    <div className="h-64 w-full" role="img" aria-label="Deuda por tramo de antigüedad">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="corta"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            interval={0}
          />
          <YAxis
            tickFormatter={formatCorto}
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip content={<Ayuda />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          <Bar dataKey="importe" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {datos.map((d) => (
              <Cell key={d.tramo} fill={COLOR_TRAMO[d.tramo]} />
            ))}
            <LabelList dataKey="importe" content={EtiquetaBarra} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
