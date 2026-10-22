"use client";

import { useState } from "react";
import { DatabaseIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { useServicios } from "@/components/providers/servicios-provider";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ETIQUETA_CONDICION_IVA, type Comercio } from "@/domain/types";
import { cuitValido } from "@/domain/identificadores";
import { useConsulta } from "@/hooks/use-consulta";
import { formatCuit } from "@/lib/format";

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

function FormComercio({ comercio, editable }: { comercio: Comercio; editable: boolean }) {
  const servicios = useServicios();
  const [datos, setDatos] = useState(comercio);
  const [guardando, setGuardando] = useState(false);
  const cuitOk = cuitValido(datos.cuit);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cuitOk) return;
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
          <Label>Condición frente al IVA</Label>
          <Input value={ETIQUETA_CONDICION_IVA[datos.condicionIva]} disabled />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv">Punto de venta</Label>
          <Input id="pv" value={datos.puntoVenta.toString().padStart(4, "0")} disabled />
        </div>
      </CardContent>
      {editable && (
        <CardFooter className="mt-4 justify-end">
          <Button type="submit" disabled={guardando || !cuitOk}>
            Guardar cambios
          </Button>
        </CardFooter>
      )}
    </form>
  );
}

export function ConfiguracionView() {
  const servicios = useServicios();
  const { puede } = useAuth();
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
      toast.success("Datos de la demo restaurados");
      setConfirmar(false);
    } finally {
      setReiniciando(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 md:p-6">
      <PageHeader titulo="Configuración" descripcion="Datos del comercio y de la demostración." />

      <Card>
        <CardHeader>
          <CardTitle>Datos del comercio</CardTitle>
          <CardDescription>
            Aparecen en las facturas y en los recibos.
            {!puede("configurar") && " Solo un administrador puede modificarlos."}
          </CardDescription>
        </CardHeader>
        {comercio ? (
          <FormComercio key={generacion} comercio={comercio} editable={puede("configurar")} />
        ) : (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <Skeleton key={c.clave} className="h-14" />
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-4" /> Datos de la demo
          </CardTitle>
          <CardDescription>
            Todo lo que se carga durante la demo queda guardado en este navegador. Reiniciar borra ventas,
            pagos y cambios, y vuelve a cargar los datos de ejemplo con fechas actualizadas a hoy.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="destructive" onClick={() => setConfirmar(true)}>
            <RotateCcwIcon /> Reiniciar datos demo
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Reiniciar los datos de la demo?</DialogTitle>
            <DialogDescription>
              Se pierden las ventas, pagos, clientes y artículos cargados o modificados. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={reiniciar} disabled={reiniciando}>
              {reiniciando ? "Reiniciando…" : "Sí, reiniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
