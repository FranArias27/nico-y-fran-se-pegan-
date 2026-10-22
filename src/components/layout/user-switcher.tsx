"use client";

import { CheckIcon, ChevronsUpDownIcon, UserRoundIcon } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { ETIQUETA_ROL } from "@/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Selector de usuario simulado (reemplaza al login en la demo). */
export function UserSwitcher() {
  const { usuario, usuarios, cambiarUsuario } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2" aria-label="Cambiar de usuario">
          <UserRoundIcon />
          <span className="hidden max-w-36 truncate sm:inline">{usuario.nombre}</span>
          <Badge variant={usuario.rol === "admin" ? "default" : "secondary"}>
            {ETIQUETA_ROL[usuario.rol]}
          </Badge>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Usuario de la demo</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {usuarios.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => cambiarUsuario(u.id)}>
            <span className="flex-1">{u.nombre}</span>
            <span className="text-xs text-muted-foreground">{ETIQUETA_ROL[u.rol]}</span>
            <CheckIcon className={u.id === usuario.id ? "opacity-100" : "opacity-0"} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
