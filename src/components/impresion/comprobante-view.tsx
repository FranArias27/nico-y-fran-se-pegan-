"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PrinterIcon, Undo2Icon } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { buscarUsuario } from "@/auth/demo-users";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { esNotaCredito, etiquetaComprobante } from "@/domain/comprobante";
import { importePendiente } from "@/domain/nota-credito";
import { useConsulta } from "@/hooks/use-consulta";
import { formatDate, formatNumeroComprobante } from "@/lib/format";
import { descripcionComprobante } from "@/services/ventas";
import { ComprobanteDocumento } from "./comprobante-documento";
import { useImprimir, type FormatoImpresion } from "./impresion-provider";
import { NotaCreditoDialog } from "./nota-credito-dialog";

export function ComprobanteView() {
  const { id } = useParams<{ id: string }>();
  const { puede } = useAuth();
  const imprimir = useImprimir();
  const [formato, setFormato] = useState<FormatoImpresion>("a4");
  const [anulando, setAnulando] = useState(false);
  const { datos, cargando } = useConsulta(
    async (s) => {
      const [venta, comercio] = await Promise.all([s.ventas.obtener(id), s.demo.obtenerComercio()]);
      if (!venta || esNotaCredito(venta)) return { venta, comercio, notas: [], cliente: undefined };
      const [notas, cliente] = await Promise.all([s.ventas.notasDeCredito(venta.id), s.clientes.obtener(venta.clienteId)]);
      return { venta, comercio, notas, cliente };
    },
    [id],
  );

  if (cargando || !datos) return <Skeleton className="m-6 h-[80vh]" />;
  const { venta, comercio, notas, cliente } = datos;
  if (!venta) return <p className="p-6 text-muted-foreground">No se encontró el comprobante.</p>;

  const pendiente = esNotaCredito(venta) ? 0 : importePendiente(venta, notas);
  const puedeAnular = puede("emitirNotasCredito") && !esNotaCredito(venta) && pendiente > 0;

  const documento = (f: FormatoImpresion) => (
    <ComprobanteDocumento
      venta={venta}
      comercio={comercio}
      formato={f}
      vendedor={venta.vendedorNombre ?? buscarUsuario(venta.vendedorId)?.nombre}
    />
  );

  return (
    <div className="grid gap-4 p-4 md:p-6">
      <PageHeader
        titulo={descripcionComprobante(venta)}
        descripcion={venta.clienteNombre}
        acciones={
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
              {(["a4", "ticket"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormato(f)}
                  className={`rounded-md px-3 py-1 font-medium ${formato === f ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  {f === "a4" ? "A4" : "Ticket 80 mm"}
                </button>
              ))}
            </div>
            {puedeAnular && (
              <Button variant="outline" onClick={() => setAnulando(true)}>
                <Undo2Icon /> {venta.tipo === "X" ? "Devolución" : "Nota de crédito"}
              </Button>
            )}
            <Button onClick={() => void imprimir(documento(formato), formato)}>
              <PrinterIcon /> Imprimir
            </Button>
          </>
        }
      />

      {venta.asociado && (
        <Alert>
          <AlertDescription>
            Anula{" "}
            <Link href={`/comprobantes/${venta.asociado.ventaId}`} className="font-medium underline">
              {etiquetaComprobante({ clase: "factura", tipo: venta.asociado.tipo })}{" "}
              {formatNumeroComprobante(venta.asociado.puntoVenta, venta.asociado.numero)}
            </Link>{" "}
            del {formatDate(venta.asociado.fecha)}.
          </AlertDescription>
        </Alert>
      )}

      {notas.length > 0 && (
        <Alert>
          <AlertDescription className="grid gap-1">
            <p>
              {pendiente > 0 ? "Anulada en parte" : "Anulada por completo"} con:
            </p>
            <ul className="grid gap-0.5">
              {notas.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/comprobantes/${n.id}`} className="font-medium underline">
                    {descripcionComprobante(n)}
                  </Link>
                  <span className="text-muted-foreground">del {formatDate(n.fecha)} ·</span>
                  <Money value={-n.totales.total} />
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-xl bg-muted p-4 md:p-8">
        <div className={`mx-auto bg-white shadow-lg ${formato === "a4" ? "w-[210mm] p-[12mm]" : "w-[80mm] p-[4mm]"}`}>
          {documento(formato)}
        </div>
      </div>

      {anulando && (
        <NotaCreditoDialog venta={venta} notas={notas} cliente={cliente} abierto={anulando} onAbierto={setAnulando} />
      )}
    </div>
  );
}
