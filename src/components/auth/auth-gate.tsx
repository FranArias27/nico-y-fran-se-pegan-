"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ServiciosProvider } from "@/components/providers/servicios-provider";
import { ImpresionProvider } from "@/components/impresion/impresion-provider";
import { Button } from "@/components/ui/button";
export function AuthGate({ children }: { children: React.ReactNode }) {
  const s = useAuth(); const path = usePathname(); const router = useRouter();
  const login = path === "/login" || /^\/[^/]+\/login$/.test(path);
  const destino = !s.cuenta ? "/login" : s.general && !s.perfil && path !== "/admin" ? "/admin" : !s.general && path === "/admin" ? "/venta" : null;
  useEffect(() => { if (!login && !s.cargando && !s.error && destino) router.replace(destino); }, [login, s.cargando, s.error, destino, router]);
  if (login) return children;
  if (s.cargando) return <div className="grid min-h-dvh place-items-center" role="status">Verificando sesión…</div>;
  if (s.error) return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6"><p role="alert">{s.error}</p>{s.general && <Button onClick={() => { s.seleccionarEmpresa(null); router.replace("/admin"); }}>Volver a empresas</Button>}<Button onClick={() => void s.salir()}>Cerrar sesión</Button></div>;
  if (destino || !s.cuenta) return null;
  if (s.general && path === "/admin") return children;
  if (!s.perfil || !s.empresa?.activa) return null;
  return <AppShell><ServiciosProvider key={`${s.perfil.empresaId}:${s.cuenta.uid}`}><ImpresionProvider>{children}</ImpresionProvider></ServiciosProvider></AppShell>;
}


