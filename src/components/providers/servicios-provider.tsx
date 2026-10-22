"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/auth/auth-provider";
import { WrenchIcon } from "lucide-react";
import { AvisoCertificado } from "@/components/configuracion/aviso-certificado";
import { crearFirestoreStore } from "@/data/firestore/firestore-store";
import type { FiscalProvider } from "@/integrations/fiscal/fiscal-provider";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { crearOperacionesRemotas } from "@/integrations/servidor/operaciones";
import { auth, firestore } from "@/lib/firebase/client";
import { crearServicios, type Servicios } from "@/services";

async function token(): Promise<string> {
  if (!auth.currentUser) throw new Error("La sesión se cerró. Volvé a iniciar sesión.");
  return auth.currentUser.getIdToken();
}

/** En el navegador no se autoriza nada: el servidor lo hace al registrar la venta. */
const fiscalEnServidor: FiscalProvider = {
  autorizar: () => Promise.reject(new Error("Los comprobantes se autorizan en el servidor")),
};

/**
 * Punto único donde se eligen las implementaciones. Los datos de cada empresa
 * viven en Firestore. Ventas, notas de crédito y pagos se registran en el
 * servidor (/api/operaciones), que también factura: con ARCA en las empresas
 * reales y simulado en las de demostración. Mercado Pago sigue simulado (en
 * las empresas reales no se ofrece el cobro con QR).
 */
const instancias = new Map<string, Servicios>();
function obtenerServicios(empresaId: string, verCostos: boolean): Servicios {
  const clave = `${empresaId}:${verCostos}`;
  let instancia = instancias.get(clave);
  if (instancia) return instancia;
  const base = crearServicios({
    store: crearFirestoreStore(firestore, empresaId, { verCostos }),
    fiscal: fiscalEnServidor,
    pagos: crearMercadoPagoSimulado(),
    ahora: () => new Date(),
    nuevoId: () => crypto.randomUUID(),
  });
  const remotas = crearOperacionesRemotas({ empresaId, token });
  instancia = {
    ...base,
    ventas: { ...base.ventas, registrar: remotas.registrarVenta, emitirNotaCredito: remotas.emitirNotaCredito },
    cuentaCorriente: { ...base.cuentaCorriente, registrarPago: remotas.registrarPago },
    demo: { ...base.demo, reiniciar: remotas.reiniciarDemo },
  };
  instancias.set(clave, instancia);
  return instancia;
}

/** Pasa los costos de los datos anteriores a las colecciones que solo leen los administradores. */
async function migrarDatos(empresaId: string) {
  const marca = await getDoc(doc(firestore, "empresas", empresaId, "config", "migraciones"));
  if (marca.data()?.costosSeparados === true) return;
  const respuesta = await fetch("/api/migraciones", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ empresaId }),
  });
  if (!respuesta.ok) throw new Error(`No se pudieron migrar los costos (${respuesta.status})`);
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
    const s = obtenerServicios(empresaId, esAdmin);
    (async () => {
      if (await s.demo.estaVacia()) {
        if (!esAdmin) throw new Error("La empresa todavía no está configurada: un administrador tiene que ingresar primero");
        // La de demostración arranca con la ferretería de ejemplo; las reales, vacías.
        if (demo) await s.demo.reiniciar();
        else await s.demo.inicializarEmpresa(nombreEmpresa);
      }
      // En segundo plano: no hace falta esperarla para trabajar.
      if (esAdmin) migrarDatos(empresaId).catch((e: unknown) => console.error(e));
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

  return (
    <Contexto.Provider value={servicios}>
      <AvisoCertificado />
      {children}
    </Contexto.Provider>
  );
}

export function useServicios(): Servicios {
  const s = useContext(Contexto);
  if (!s) throw new Error("useServicios debe usarse dentro de <ServiciosProvider>");
  return s;
}


