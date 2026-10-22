export type Rol = "admin" | "vendedor";

export type Permiso =
  | "verCostos" // costos, márgenes y ganancia
  | "editarPrecios" // alta/edición de artículos y modificación masiva
  | "verReportes"
  | "aplicarDescuentos"
  | "configurar";

const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  admin: ["verCostos", "editarPrecios", "verReportes", "aplicarDescuentos", "configurar"],
  vendedor: [],
};

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Admin",
  vendedor: "Vendedor",
};
