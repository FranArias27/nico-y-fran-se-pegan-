"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { WrenchIcon } from "lucide-react";
import { crearDexieStore } from "@/data/indexeddb/dexie-store";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { crearServicios, type Servicios } from "@/services";

/**
 * Punto único donde se eligen las implementaciones. Para pasar a un backend
 * real se reemplazan acá el store y los proveedores.
 */
let instancia: Servicios | null = null;
function obtenerServicios(): Servicios {
  instancia ??= crearServicios({
    store: crearDexieStore(),
    fiscal: crearArcaSimulado(),
    pagos: crearMercadoPagoSimulado(),
    ahora: () => new Date(),
    nuevoId: () => crypto.randomUUID(),
  });
  return instancia;
}

const Contexto = createContext<Servicios | null>(null);

export function ServiciosProvider({ children }: { children: React.ReactNode }) {
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = obtenerServicios();
    s.demo
      .asegurarDatos()
      .then(() => setServicios(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">No se pudieron cargar los datos de la demo</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {error}. Probá recargar la página; si estás en una ventana privada, abrila en una normal.
        </p>
      </div>
    );
  }

  if (!servicios) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <WrenchIcon className="size-6 animate-spin text-primary" />
        <p className="text-sm">Preparando la demo…</p>
      </div>
    );
  }

  return <Contexto.Provider value={servicios}>{children}</Contexto.Provider>;
}

export function useServicios(): Servicios {
  const s = useContext(Contexto);
  if (!s) throw new Error("useServicios debe usarse dentro de <ServiciosProvider>");
  return s;
}
