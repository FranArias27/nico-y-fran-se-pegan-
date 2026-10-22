"use client";

import { CheckIcon } from "lucide-react";
import { EstadoClienteBadge } from "@/components/common/estado-cliente-badge";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ETIQUETA_CONDICION_IVA, type Cliente } from "@/domain/types";
import { formatCuit } from "@/lib/format";

export function ClienteSelector({
  abierto,
  onAbierto,
  clientes,
  seleccionadoId,
  onElegir,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  clientes: readonly Cliente[];
  seleccionadoId: string;
  onElegir: (cliente: Cliente) => void;
}) {
  return (
    <CommandDialog
      open={abierto}
      onOpenChange={onAbierto}
      title="Elegir cliente"
      description="Buscá por nombre, nombre de fantasía o CUIT"
    >
      <Command>
        <CommandInput placeholder="Buscar cliente por nombre o CUIT…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>No hay clientes que coincidan.</CommandEmpty>
          <CommandGroup>
            {clientes.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.razonSocial} ${c.nombreFantasia ?? ""} ${c.documento}`}
                onSelect={() => onElegir(c)}
                className="flex items-center gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.razonSocial}
                    {c.nombreFantasia && <span className="font-normal text-muted-foreground"> · {c.nombreFantasia}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ETIQUETA_CONDICION_IVA[c.condicionIva]}
                    {c.documento && ` · ${c.documento.length === 11 ? formatCuit(c.documento) : `DNI ${c.documento}`}`}
                    {c.cuentaCorriente && " · Cuenta corriente"}
                  </p>
                </div>
                {c.estado !== "habilitado" && <EstadoClienteBadge estado={c.estado} />}
                {c.id === seleccionadoId && <CheckIcon className="text-primary" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
