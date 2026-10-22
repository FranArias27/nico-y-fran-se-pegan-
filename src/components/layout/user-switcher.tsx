"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
export function UserSwitcher() {
  const { usuario, salir, general, seleccionarEmpresa } = useAuth();
  const router = useRouter();
  return <div className="flex items-center gap-3">{general && <Button variant="outline" onClick={() => { seleccionarEmpresa(null); router.push("/admin"); }}>Volver a empresas</Button>}<span className="text-sm">{usuario.nombre}</span><Button variant="outline" onClick={() => void salir()}>Cerrar sesión</Button></div>;
}

