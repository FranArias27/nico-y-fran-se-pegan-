"use client";

import Link from "next/link";
import { useAuth } from "@/auth/auth-provider";
import { useServicios } from "@/components/providers/servicios-provider";
import { useConsulta } from "@/hooks/use-consulta";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Con cuántos días de anticipación se avisa. Renovarlo en ARCA lleva un rato. */
const ANTICIPACION_DIAS = 30;

/** Avisa a los administradores que el certificado de ARCA está por vencer o venció. */
export function AvisoCertificado() {
  const { puede, empresa } = useAuth();
  const servicios = useServicios();
  const { datos: comercio } = useConsulta((s) => s.demo.obtenerComercio());
  const vence = comercio?.certificadoArca?.vence;
  if (!puede("configurar") || empresa?.demo || !vence) return null;

  const dias = Math.ceil((Date.parse(vence) - servicios.ahora().getTime()) / DIA_MS);
  if (dias > ANTICIPACION_DIAS) return null;

  return (
    <p
      role="alert"
      className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200 print:hidden"
    >
      {dias <= 0
        ? "El certificado de ARCA venció: no se pueden emitir facturas."
        : `El certificado de ARCA vence ${dias === 1 ? "mañana" : `en ${dias} días`}.`}{" "}
      <Link href="/configuracion" className="underline underline-offset-2">
        Renovarlo en Configuración
      </Link>
    </p>
  );
}
