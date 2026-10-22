"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCorto } from "@/components/cobranza/tramos-chart";
import { formatMoney } from "@/lib/format";

const EJE = { fill: "var(--muted-foreground)", fontSize: 12 };

// ---------------------------------------------------------------------------
// Evolución diaria: período actual vs. anterior

export interface PuntoEvolucion {
  etiqueta: string;
  actual: number;
  anterior: number | null;
  fechaActual: string;
  fechaAnterior: string | null;
}

function AyudaEvolucion({ active, payload }: { active?: boolean; payload?: { payload: PuntoEvolucion }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-0.5 w-3 rounded bg-[var(--serie-1)]" /> {p.fechaActual}
        </span>
        <span className="tabular font-semibold">{formatMoney(p.actual)}</span>
      </div>
      {p.anterior !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3 rounded bg-[var(--serie-anterior)]" /> {p.fechaAnterior}
          </span>
          <span className="tabular">{formatMoney(p.anterior)}</span>
        </div>
      )}
    </div>
  );
}

export function EvolucionChart({ datos }: { datos: PuntoEvolucion[] }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--serie-1)]" /> Período elegido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-[var(--serie-anterior)]" /> Período anterior
        </span>
      </div>
      <div className="h-72 w-full" role="img" aria-label="Ventas por día del período elegido y del anterior">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={EJE} minTickGap={16} />
            <YAxis tickFormatter={formatCorto} tickLine={false} axisLine={false} width={72} tick={EJE} />
            <Tooltip content={<AyudaEvolucion />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            <Line
              type="linear"
              dataKey="anterior"
              stroke="var(--serie-anterior)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="actual"
              stroke="var(--serie-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontales (una sola serie)

export interface Barra {
  nombre: string;
  valor: number;
  detalle?: string;
}

function AyudaBarra({ active, payload }: { active?: boolean; payload?: { payload: Barra }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-xs text-muted-foreground">{b.nombre}</p>
      <p className="tabular font-semibold">{formatMoney(b.valor)}</p>
      {b.detalle && <p className="text-xs text-muted-foreground">{b.detalle}</p>}
    </div>
  );
}

function EtiquetaFinal(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6;
  const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2;
  return (
    <text x={x} y={y} dominantBaseline="central" fill="var(--foreground)" fontSize={12} fontWeight={500}>
      {formatCorto(Number(props.value ?? 0))}
    </text>
  );
}

export function BarrasHorizontales({ datos, ancho = 150 }: { datos: Barra[]; ancho?: number }) {
  const alto = Math.max(datos.length * 36 + 16, 80);
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="nombre"
            width={ancho}
            tickLine={false}
            axisLine={false}
            tick={{ ...EJE, fill: "var(--foreground)" }}
          />
          <Tooltip content={<AyudaBarra />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          <Bar dataKey="valor" fill="var(--serie-1)" radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="valor" content={EtiquetaFinal} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
