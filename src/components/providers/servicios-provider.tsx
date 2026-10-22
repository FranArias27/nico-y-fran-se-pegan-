"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { WrenchIcon } from "lucide-react";
import { crearFirestoreStore } from "@/data/firestore/firestore-store";
import { crearArcaRemoto } from "@/integrations/fiscal/arca-remoto";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { auth, firestore } from "@/lib/firebase/client";
import { crearServicios, type Servicios } from "@/services";

/**
 * Punto único donde se eligen las implementaciones. Los datos de cada empresa
 * viven en Firestore. Las empresas reales facturan con ARCA; solo las de
 * demostración usan la facturación simulada. Mercado Pago sigue simulado (en
 * las empresas reales no se ofrece el cobro con QR).
 */
const instancias = new Map<string, Servicios>();
function obtenerServicios(empresaId: string, demo: boolean): Servicios {
  const clave = `${empresaId}:${demo}`;
  let instancia = instancias.get(clave);
  if (instancia) return instancia;
  const store = crearFirestoreStore(firestore, empresaId);
  const fiscal = demo
    ? crearArcaSimulado({ numerar: (c) => store.contadores.siguiente(c) })
    : crearArcaRemoto({
        empresaId,
        token: async () => {
          if (!auth.currentUser) throw new Error("La sesión se cerró. Volvé a iniciar sesión.");
          return auth.currentUser.getIdToken();
        },
      });
  instancia = crearServicios({
    store,
    fiscal,
    pagos: crearMercadoPagoSimulado(),
    ahora: () => new Date(),
    nuevoId: () => crypto.randomUUID(),
  });
  instancias.set(clave, instancia);
  return instancia;
}

const Contexto = createContext<Servicios | null>(null);

export function ServiciosProvider({ children }: { children: React.ReactNode }) {
  const { perfil, empresa } = useAuth();
  const empresaId = perfil?.empresaId;
  const esAdmin = perfil?.rol === "admin";
  const nombreEmpresa = empresa?.nombre ?? "";
  const demo = empresa?.demo === true;
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    const s = obtenerServicios(empresaId, demo);
    (async () => {
      if (await s.demo.estaVacia()) {
        if (!esAdmin) throw new Error("La empresa todavía no está configurada: un administrador tiene que ingresar primero");
        // La de demostración arranca con la ferretería de ejemplo; las reales, vacías.
        if (demo) await s.demo.reiniciar();
        else await s.demo.inicializarEmpresa(nombreEmpresa);
      }
    })()
      .then(() => { if (vigente) setServicios(s); })
      .catch((e: unknown) => {
        if (!vigente) return;
        const codigo = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
        setError(
          codigo === "permission-denied"
            ? "Firestore rechazó el acceso. Verificá que estén publicadas las reglas de firestore.rules"
            : e instanceof Error ? e.message.replace(/\.+$/, "") : String(e),
        );
      });
    return () => { vigente = false; };
  }, [empresaId, esAdmin, nombreEmpresa, demo]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">No se pudieron cargar los datos de la empresa</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {error}. Probá recargar la página y revisá la conexión a internet.
        </p>
      </div>
    );
  }

  if (!servicios) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <WrenchIcon className="size-6 animate-spin text-primary" />
        <p className="text-sm">Cargando datos de la empresa…</p>
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


