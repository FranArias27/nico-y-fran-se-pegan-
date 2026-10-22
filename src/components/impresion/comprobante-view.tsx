"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { buscarUsuario } from "@/auth/demo-users";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsulta } from "@/hooks/use-consulta";
import { descripcionComprobante } from "@/services/ventas";
import { ComprobanteDocumento } from "./comprobante-documento";
import { useImprimir, type FormatoImpresion } from "./impresion-provider";

export function ComprobanteView() {
  const { id } = useParams<{ id: string }>();
  const imprimir = useImprimir();
  const [formato, setFormato] = useState<FormatoImpresion>("a4");
  const { datos, cargando } = useConsulta(
    async (s) => {
      const [venta, comercio] = await Promise.all([s.ventas.obtener(id), s.demo.obtenerComercio()]);
      return { venta, comercio };
    },
    [id],
  );

  if (cargando || !datos) return <Skeleton className="m-6 h-[80vh]" />;
  const { venta, comercio } = datos;
  if (!venta) return <p className="p-6 text-muted-foreground">No se encontró el comprobante.</p>;

  const documento = (f: FormatoImpresion) => (
    <ComprobanteDocumento
      venta={venta}
      comercio={comercio}
      formato={f}
      vendedor={buscarUsuario(venta.vendedorId)?.nombre}
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
            <Button onClick={() => void imprimir(documento(formato), formato)}>
              <PrinterIcon /> Imprimir
            </Button>
          </>
        }
      />
      <div className="overflow-x-auto rounded-xl bg-muted p-4 md:p-8">
        <div className={`mx-auto bg-white shadow-lg ${formato === "a4" ? "w-[210mm] p-[12mm]" : "w-[80mm] p-[4mm]"}`}>
          {documento(formato)}
        </div>
      </div>
    </div>
  );
}
