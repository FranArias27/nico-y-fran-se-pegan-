import {
  BarChart3Icon,
  HandCoinsIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Permiso } from "@/auth/permissions";

export interface NavItem {
  href: string;
  etiqueta: string;
  /** Etiqueta corta para la barra inferior del celular. */
  corta: string;
  icono: LucideIcon;
  permiso?: Permiso;
  /** Si es false, no aparece en la barra inferior del celular (va al menú). */
  enBarraMovil?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/venta", etiqueta: "Venta", corta: "Venta", icono: ShoppingCartIcon },
  { href: "/articulos", etiqueta: "Artículos", corta: "Artículos", icono: PackageIcon },
  { href: "/clientes", etiqueta: "Clientes", corta: "Clientes", icono: UsersIcon },
  { href: "/cobranza", etiqueta: "Cobranza", corta: "Cobranza", icono: HandCoinsIcon },
  {
    href: "/reportes",
    etiqueta: "Reportes",
    corta: "Reportes",
    icono: BarChart3Icon,
    permiso: "verReportes",
  },
  {
    href: "/configuracion",
    etiqueta: "Configuración",
    corta: "Config.",
    icono: SettingsIcon,
    enBarraMovil: false,
  },
];
