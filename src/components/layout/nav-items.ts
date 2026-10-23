import {
  BarChart3Icon,
  HandCoinsIcon,
  PackageIcon,
  ReceiptTextIcon,
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
  { href: "/gestion", etiqueta: "Caja y mercadería", corta: "Caja", icono: PackageIcon, permiso: "configurar", enBarraMovil: false },
  { href: "/herramientas", etiqueta: "Herramientas", corta: "Herram.", icono: SettingsIcon, enBarraMovil: false },
  { href: "/venta", etiqueta: "Venta", corta: "Venta", icono: ShoppingCartIcon },
  { href: "/ventas", etiqueta: "Comprobantes", corta: "Comprob.", icono: ReceiptTextIcon, enBarraMovil: false },
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
