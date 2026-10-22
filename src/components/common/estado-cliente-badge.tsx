import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_CLIENTE, type EstadoCliente } from "@/domain/types";
import { cn } from "@/lib/utils";

const ESTILO: Record<EstadoCliente, string> = {
  habilitado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  observacion: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  bloqueado: "bg-destructive/10 text-destructive",
};

export function EstadoClienteBadge({ estado, className }: { estado: EstadoCliente; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(ESTILO[estado], className)}>
      {ETIQUETA_ESTADO_CLIENTE[estado]}
    </Badge>
  );
}
