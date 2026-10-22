"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsIcon, WrenchIcon } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { UserSwitcher } from "./user-switcher";

function useItemsVisibles() {
  const { puede } = useAuth();
  return NAV_ITEMS.filter((item) => !item.permiso || puede(item.permiso));
}

function estaActivo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { empresa } = useAuth();
  const items = useItemsVisibles();

  return (
    <div className="flex min-h-dvh">
      {/* Barra lateral (PC y tablet) */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex print:hidden">
        <Link href="/venta" className="flex h-14 items-center gap-2 border-b px-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <WrenchIcon className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{empresa?.nombre}</span>
            <span className="block text-xs text-muted-foreground">Mostrador y cobranza</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Principal">
          {items.map((item) => {
            const activo = estaActivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activo
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icono className={cn("size-4", activo && "text-primary")} />
                {item.etiqueta}
              </Link>
            );
          })}
        </nav>
        <p className="p-4 text-xs text-muted-foreground">Prototipo de demostración</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur print:hidden">
          <Link href="/venta" className="flex items-center gap-2 md:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <WrenchIcon className="size-4" />
            </span>
            <span className="text-sm font-semibold">{empresa?.nombre}</span>
          </Link>
          <div className="flex-1" />
          <UserSwitcher />
          <Button asChild variant="ghost" size="icon-lg" className="md:hidden" aria-label="Configuración">
            <Link href="/configuracion">
              <SettingsIcon />
            </Link>
          </Button>
        </header>

        {empresa?.demo && (
          <p className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200 print:hidden">
            Empresa de demostración · datos de ejemplo y facturas sin validez fiscal
          </p>
        )}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Barra inferior (celular) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        {items
          .filter((item) => item.enBarraMovil !== false)
          .map((item) => {
            const activo = estaActivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  activo ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icono className="size-5" />
                {item.corta}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}


