"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { buscarUsuario, USUARIOS_DEMO, type Usuario } from "./demo-users";
import { tienePermiso, type Permiso } from "./permissions";

/**
 * Sesión simulada: el usuario activo se elige con un selector en el
 * encabezado y se recuerda en localStorage. Al sumar login real, solo cambia
 * este provider; el resto de la app usa useAuth().
 */

const CLAVE = "el-tornillo:usuario";
const evento = "el-tornillo:usuario-cambio";

function leerUsuarioId(): string {
  try {
    return localStorage.getItem(CLAVE) ?? USUARIOS_DEMO[0].id;
  } catch {
    return USUARIOS_DEMO[0].id;
  }
}

function suscribir(callback: () => void) {
  window.addEventListener(evento, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(evento, callback);
    window.removeEventListener("storage", callback);
  };
}

interface AuthContexto {
  usuario: Usuario;
  usuarios: readonly Usuario[];
  cambiarUsuario: (id: string) => void;
  puede: (permiso: Permiso) => boolean;
}

const Contexto = createContext<AuthContexto | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const usuarioId = useSyncExternalStore(suscribir, leerUsuarioId, () => USUARIOS_DEMO[0].id);
  const usuario = buscarUsuario(usuarioId) ?? USUARIOS_DEMO[0];

  const cambiarUsuario = useCallback((id: string) => {
    try {
      localStorage.setItem(CLAVE, id);
    } catch {
      // Sin almacenamiento disponible: el cambio dura hasta recargar.
    }
    window.dispatchEvent(new Event(evento));
  }, []);

  const valor = useMemo<AuthContexto>(
    () => ({
      usuario,
      usuarios: USUARIOS_DEMO,
      cambiarUsuario,
      puede: (permiso) => tienePermiso(usuario.rol, permiso),
    }),
    [usuario, cambiarUsuario],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): AuthContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
