"use client";

import { LockIcon } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import type { Permiso } from "@/auth/permissions";

/** Muestra el contenido solo si el usuario activo tiene el permiso. */
export function RequirePermission({
  permiso,
  children,
}: {
  permiso: Permiso;
  children: React.ReactNode;
}) {
  const { puede } = useAuth();
  if (puede(permiso)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <LockIcon className="size-8 text-muted-foreground" />
      <p className="font-medium">Esta sección es solo para administradores</p>
      <p className="text-sm text-muted-foreground">
        Cambiá a un usuario Admin desde el selector de arriba a la derecha.
      </p>
    </div>
  );
}
