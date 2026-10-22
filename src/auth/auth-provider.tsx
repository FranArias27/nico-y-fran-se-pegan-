"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase/client";
import type { Usuario } from "./demo-users";
import { tienePermiso, type Permiso } from "./permissions";

/** `demo`: empresa de demostración, con datos de ejemplo y facturación simulada. */
export interface Empresa { nombre: string; activa: boolean; demo?: boolean }
export interface Perfil { nombre: string; empresaId: string; rol: "admin" | "vendedor"; activo: boolean }
interface Sesion {
  cuenta: User | null;
  perfil: Perfil | null;
  empresa: Empresa | null;
  general: boolean;
  cargando: boolean;
  error: string | null;
  usuario: Usuario;
  puede: (permiso: Permiso) => boolean;
  salir: () => Promise<void>;
  seleccionarEmpresa: (id: string | null) => void;
}
const Contexto = createContext<Sesion | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Omit<Sesion, "usuario" | "puede" | "salir" | "seleccionarEmpresa">>({ cuenta: null, perfil: null, empresa: null, general: false, cargando: true, error: null });
  useEffect(() => {
    let limpiar = () => {};
    const off = onAuthStateChanged(auth, (cuenta) => {
      limpiar();
      setEstado({ cuenta, perfil: null, empresa: null, general: false, cargando: !!cuenta, error: null });
      if (!cuenta) return;
      let offEmpresa = () => {};
      const offPerfil = onSnapshot(doc(firestore, "usuarios", cuenta.uid), (snap) => {
        offEmpresa();
        const data = snap.data();
        if (data?.rol === "superadmin" && data.activo === true) {
          setEstado({ cuenta, perfil: null, empresa: null, general: true, cargando: false, error: null });
          return;
        }
        if (!data || data.activo !== true || !["admin", "vendedor"].includes(data.rol) || typeof data.empresaId !== "string") {
          setEstado({ cuenta, perfil: null, empresa: null, general: false, cargando: false, error: "Tu cuenta no tiene acceso activo. Contactá al administrador." });
          return;
        }
        const perfil = data as Perfil;
        setEstado({ cuenta, perfil: null, empresa: null, general: false, cargando: true, error: null });
        offEmpresa = onSnapshot(doc(firestore, "empresas", perfil.empresaId), (empresaSnap) => {
          const empresa = empresaSnap.data() as Empresa | undefined;
          setEstado({ cuenta, perfil, empresa: empresa ?? null, general: false, cargando: false, error: empresa?.activa ? null : "El acceso de esta empresa está deshabilitado." });
        }, () => setEstado({ cuenta, perfil: null, empresa: null, general: false, cargando: false, error: "No se pudo verificar el acceso a la empresa." }));
      }, () => setEstado({ cuenta, perfil: null, empresa: null, general: false, cargando: false, error: "No se pudieron consultar los permisos. Verificá la conexión y las reglas de Firestore." }));
      limpiar = () => { offPerfil(); offEmpresa(); };
    });
    return () => { off(); limpiar(); };
  }, []);
  const clave = `el-tornillo:empresa-soporte:${estado.cuenta?.uid ?? ""}`;
  const seleccion = useSyncExternalStore(
    (callback) => { window.addEventListener("empresa-soporte", callback); return () => window.removeEventListener("empresa-soporte", callback); },
    () => { try { return sessionStorage.getItem(clave) ?? ""; } catch { return ""; } },
    () => "",
  );
  const [soporte, setSoporte] = useState<{ id: string; empresa: Empresa | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!estado.general || !seleccion) return;
    return onSnapshot(doc(firestore, "empresas", seleccion), snap => {
      const empresa = snap.data() as Empresa | undefined;
      setSoporte({ id: seleccion, empresa: empresa ?? null, error: empresa?.activa ? null : "La empresa no existe o está deshabilitada." });
    }, () => setSoporte({ id: seleccion, empresa: null, error: "No se pudo abrir la empresa." }));
  }, [estado.general, seleccion]);
  const seleccionarEmpresa = (id: string | null) => {
    if (!estado.general) return;
    setSoporte(null);
    try { if (id) sessionStorage.setItem(clave, id); else sessionStorage.removeItem(clave); } catch { return; }
    window.dispatchEvent(new Event("empresa-soporte"));
  };
  const enSoporte = estado.general && !!seleccion;
  const empresa = enSoporte ? soporte?.id === seleccion ? soporte.empresa : null : estado.empresa;
  const perfil: Perfil | null = enSoporte && empresa ? { nombre: estado.cuenta?.email ?? "Administrador general", empresaId: seleccion, rol: "admin", activo: true } : estado.perfil;
  const error = estado.error ?? (enSoporte && soporte?.id === seleccion ? soporte.error : null);
  const usuario: Usuario = { id: estado.cuenta?.uid ?? "", nombre: perfil?.nombre ?? estado.cuenta?.email ?? "", rol: perfil?.rol ?? "vendedor" };
  return <Contexto.Provider value={{ ...estado, perfil, empresa, error, cargando: estado.cargando || (enSoporte && soporte?.id !== seleccion), seleccionarEmpresa, usuario, puede: (p) => !error && !!perfil && !!empresa?.activa && tienePermiso(usuario.rol, p), salir: () => signOut(auth) }}>{children}</Contexto.Provider>;
}
export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAuth requiere AuthProvider");
  return ctx;
}

