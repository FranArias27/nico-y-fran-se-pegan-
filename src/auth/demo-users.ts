import type { Rol } from "./permissions";

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
}

/**
 * Usuarios de la demo. Cuando haya login real, este listado sale del backend.
 * Los ids de los vendedores se usan también en el historial de ventas de ejemplo.
 */
export const USUARIOS_DEMO: readonly Usuario[] = [
  { id: "u-admin", nombre: "Carlos Ruiz", rol: "admin" },
  { id: "u-lucia", nombre: "Lucía Gómez", rol: "vendedor" },
];

export function buscarUsuario(id: string): Usuario | undefined {
  return USUARIOS_DEMO.find((u) => u.id === id);
}
