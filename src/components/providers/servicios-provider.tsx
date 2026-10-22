"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { WrenchIcon } from "lucide-react";
import { crearDexieStore } from "@/data/indexeddb/dexie-store";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { crearServicios, type Servicios } from "@/services";

/**
 * Punto único donde se eligen las implementaciones. Para pasar a un backend
 * real se reemplazan acá el store y los proveedores.
 */
const instancias = new Map<string, Servicios>();
function obtenerServicios(empresaId: string): Servicios {
  let instancia = instancias.get(empresaId);
  if (instancia) return instancia;
  instancia = crearServicios({
    store: crearDexieStore(`el-tornillo-empresa-${empresaId}`),
    fiscal: crearArcaSimulado(),
    pagos: crearMercadoPagoSimulado(),
    ahora: () => new Date(),
    nuevoId: () => crypto.randomUUID(),
  });
  instancias.set(empresaId, instancia);
  return instancia;
}

const Contexto = createContext<Servicios | null>(null);

export function ServiciosProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = useAuth();
  const empresaId = perfil?.empresaId;
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    const s = obtenerServicios(empresaId);
    s.demo
      .asegurarDatos()
      .then(() => { if (vigente) setServicios(s); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => { vigente = false; };
  }, [empresaId]);

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


