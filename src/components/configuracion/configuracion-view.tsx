"use client";

import { useState } from "react";
import { DatabaseIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { useServicios } from "@/components/providers/servicios-provider";
import { CertificadoArca } from "./certificado-arca";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CONDICIONES_EMISOR } from "@/domain/comprobante";
import { ETIQUETA_CONDICION_IVA, type Comercio, type CondicionIva } from "@/domain/types";
import { cuitValido } from "@/domain/identificadores";
import { useConsulta } from "@/hooks/use-consulta";
import { formatCuit, formatDate } from "@/lib/format";

const CAMPOS: { clave: keyof Comercio; etiqueta: string; ancho?: "completo" }[] = [
  { clave: "razonSocial", etiqueta: "Razón social" },
  { clave: "nombreFantasia", etiqueta: "Nombre de fantasía" },
  { clave: "cuit", etiqueta: "CUIT" },
  { clave: "ingresosBrutos", etiqueta: "Ingresos Brutos" },
  { clave: "domicilio", etiqueta: "Domicilio" },
  { clave: "localidad", etiqueta: "Localidad" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "email", etiqueta: "Email" },
];

/** Cómo factura el comercio: simulado en la demo, con ARCA en las empresas reales. */
function EstadoFacturacion({ comercio, demo }: { comercio: Comercio; demo: boolean }) {
  const cert = comercio.certificadoArca;
  const texto = demo
    ? "Empresa de demostración: las facturas llevan un CAE simulado y no tienen validez fiscal."
    : !cert
      ? "Todavía no se puede facturar: cargá el certificado de ARCA más abajo. Mientras tanto, solo se emiten notas de pedido."
      : cert.entorno === "homologacion"
        ? "Certificado de prueba (homologación): los CAE no tienen validez fiscal. Cargá el de producción para facturar."
        : `Facturación electrónica con ARCA activa. El certificado vence el ${formatDate(cert.vence)}.`;
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label>Facturación electrónica</Label>
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function FormComercio({ comercio, editable, demo }: { comercio: Comercio; editable: boolean; demo: boolean }) {
  const servicios = useServicios();
  const [datos, setDatos] = useState(comercio);
  const [guardando, setGuardando] = useState(false);
  // Una empresa nueva arranca sin CUIT: se puede guardar vacío, pero no uno inválido.
  const cuitOk = datos.cuit === "" || cuitValido(datos.cuit);
  const puntoVentaOk = Number.isInteger(datos.puntoVenta) && datos.puntoVenta >= 1 && datos.puntoVenta <= 99999;
  const fiscalCambiado =
    datos.condicionIva !== comercio.condicionIva || datos.puntoVenta !== comercio.puntoVenta;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cuitOk || !puntoVentaOk) return;
    setGuardando(true);
    try {
      await servicios.demo.guardarComercio({ ...datos, cuit: datos.cuit.replace(/\D/g, "") });
      toast.success("Datos del comercio guardados");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map(({ clave, etiqueta }) => (
          <div key={clave} className="grid gap-1.5">
            <Label htmlFor={clave}>{etiqueta}</Label>
            <Input
              id={clave}
              value={clave === "cuit" && !editable ? formatCuit(String(datos[clave])) : String(datos[clave])}
              onChange={(e) => setDatos({ ...datos, [clave]: e.target.value })}
              disabled={!editable}
              aria-invalid={clave === "cuit" && !cuitOk ? true : undefined}
            />
            {clave === "cuit" && !cuitOk && <p className="text-xs text-destructive">El CUIT no es válido.</p>}
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="condicion-iva">Condición frente al IVA</Label>
          <Select
            value={datos.condicionIva}
            onValueChange={(v) => setDatos({ ...datos, condicionIva: v as CondicionIva })}
            disabled={!editable}
          >
            <SelectTrigger id="condicion-iva" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDICIONES_EMISOR.map((c) => (
                <SelectItem key={c} value={c}>
                  {ETIQUETA_CONDICION_IVA[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {datos.condicionIva === "RI" ? "Emite Factura A y B." : "Emite Factura C."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv">Punto de venta</Label>
          <Input
            id="pv"
            inputMode="numeric"
            value={editable ? String(datos.puntoVenta || "") : datos.puntoVenta.toString().padStart(4, "0")}
            onChange={(e) => setDatos({ ...datos, puntoVenta: Number(e.target.value.replace(/\D/g, "")) })}
            disabled={!editable}
            aria-invalid={!puntoVentaOk || undefined}
          />
          <p className="text-xs text-muted-foreground">
            El punto de venta de factura electrónica dado de alta en ARCA (tipo &quot;web service&quot;).
          </p>
        </div>
        <EstadoFacturacion comercio={comercio} demo={demo} />
        {fiscalCambiado && (
          <p className="text-sm text-amber-700 sm:col-span-2 dark:text-amber-400">
            Cambiar la condición de IVA o el punto de venta afecta a los comprobantes nuevos. Confirmalo con tu
            contador antes de guardar.
          </p>
        )}
      </CardContent>
      {editable && (
        <CardFooter className="mt-4 justify-end">
          <Button type="submit" disabled={guardando || !cuitOk || !puntoVentaOk}>
            Guardar cambios
          </Button>
        </CardFooter>
      )}
    </form>
  );
}

export function ConfiguracionView() {
  const servicios = useServicios();
  const { puede, empresa } = useAuth();
  const demo = empresa?.demo === true;
  const { datos: comercio } = useConsulta((s) => s.demo.obtenerComercio());
  const [confirmar, setConfirmar] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  // Al reiniciar se remonta el formulario con los datos nuevos.
  const [generacion, setGeneracion] = useState(0);

  async function reiniciar() {
    setReiniciando(true);
    try {
      await servicios.demo.reiniciar();
      setGeneracion((g) => g + 1);
      toast.success("Demo reiniciada");
      setConfirmar(false);
    } finally {
      setReiniciando(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 md:p-6">
      <PageHeader
        titulo="Configuración"
        descripcion={demo ? "Empresa de demostración: los datos son de ejemplo." : "Datos del comercio."}
      />

      <Card>
        <CardHeader>
          <CardTitle>Datos del comercio</CardTitle>
          <CardDescription>
            Aparecen en las facturas y en los recibos.
            {!puede("configurar") && " Solo un administrador puede modificarlos."}
          </CardDescription>
        </CardHeader>
        {comercio ? (
          <FormComercio key={generacion} comercio={comercio} editable={puede("configurar")} demo={demo} />
        ) : (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <Skeleton key={c.clave} className="h-14" />
            ))}
          </CardContent>
        )}
      </Card>

      {puede("configurar") && !demo && <CertificadoArca />}

      {/* Solo en la empresa de demostración: en las reales nunca se borran datos. */}
      {puede("configurar") && demo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseIcon className="size-4" /> Reiniciar la demo
            </CardTitle>
            <CardDescription>
              Vuelve a cargar la ferretería de ejemplo con fechas actualizadas a hoy. Conviene hacerlo antes de
              cada demostración para borrar lo que se haya probado.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => setConfirmar(true)}>
              <RotateCcwIcon /> Reiniciar demo
            </Button>
          </CardFooter>
        </Card>
      )}

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Reiniciar la demo?</DialogTitle>
            <DialogDescription>
              Se borra todo lo cargado en esta empresa de demostración y se vuelven a cargar los datos de ejemplo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={reiniciar} disabled={reiniciando}>
              {reiniciando ? "Reiniciando…" : "Sí, reiniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
