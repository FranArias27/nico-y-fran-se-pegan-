"use client";

import Link from "next/link";
import { CheckCircle2Icon, ExternalLinkIcon, PrinterIcon, ReceiptIcon } from "lucide-react";
import { buscarUsuario } from "@/auth/demo-users";
import { Money } from "@/components/common/money";
import { ComprobanteDocumento } from "@/components/impresion/comprobante-documento";
import { useImprimir, type FormatoImpresion } from "@/components/impresion/impresion-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Comercio, Venta } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { descripcionComprobante } from "@/services/ventas";

export function VentaExitosaDialog({
  venta,
  comercio,
  onCerrar,
}: {
  venta: Venta | null;
  comercio: Comercio | undefined;
  onCerrar: () => void;
}) {
  const imprimir = useImprimir();

  function imprimirEn(formato: FormatoImpresion) {
    if (!venta || !comercio) return;
    void imprimir(
      <ComprobanteDocumento
        venta={venta}
        comercio={comercio}
        formato={formato}
        vendedor={buscarUsuario(venta.vendedorId)?.nombre}
      />,
      formato,
    );
  }

  return (
    <Dialog open={venta !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {venta && (
          <>
            <DialogHeader className="items-center text-center">
              <CheckCircle2Icon className="size-12 text-emerald-600" />
              <DialogTitle className="text-xl">Venta registrada</DialogTitle>
              <DialogDescription>
                {descripcionComprobante(venta)} · {venta.clienteNombre}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <Money value={venta.totales.total} className="text-3xl font-bold" />
              </div>
              {venta.vuelto > 0 && (
                <div className="rounded-xl bg-emerald-500/10 p-3">
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">Vuelto a entregar</p>
                  <Money value={venta.vuelto} className="text-4xl font-bold text-emerald-700 dark:text-emerald-400" />
                </div>
              )}
              {venta.fiscal && (
                <p className="text-xs text-muted-foreground">
                  CAE {venta.fiscal.cae} · vence {formatDate(venta.fiscal.caeVencimiento + "T00:00:00")} (simulado)
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => imprimirEn("ticket")}>
                <ReceiptIcon /> Ticket 80 mm
              </Button>
              <Button variant="outline" onClick={() => imprimirEn("a4")}>
                <PrinterIcon /> Hoja A4
              </Button>
              <Button variant="ghost" asChild className="col-span-2">
                <Link href={`/comprobantes/${venta.id}`} target="_blank">
                  <ExternalLinkIcon /> Ver comprobante
                </Link>
              </Button>
            </div>

            <DialogFooter>
              <Button autoFocus size="lg" className="w-full" onClick={onCerrar}>
                Nueva venta · Enter
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
