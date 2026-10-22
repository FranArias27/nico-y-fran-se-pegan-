"use client";

import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, FileKeyIcon, Loader2Icon, ShieldCheckIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { clienteCertificado, leerCertificado, type EstadoCertificado } from "@/integrations/fiscal/certificado-arca";
import { auth } from "@/lib/firebase/client";
import { formatCuit, formatDate } from "@/lib/format";

const ENTORNOS = {
  homologacion: "Pruebas (homologación)",
  produccion: "Producción",
} as const;

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "application/pkcs10" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Certificado de ARCA del comercio. La clave privada se genera y se guarda en
 * el servidor: acá solo se descarga el pedido y se sube el certificado.
 */
export function CertificadoArca() {
  const { perfil } = useAuth();
  const empresaId = perfil?.empresaId ?? "";
  const [estado, setEstado] = useState<EstadoCertificado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [entorno, setEntorno] = useState<"homologacion" | "produccion">("produccion");

  const cliente = useCallback(
    () =>
      clienteCertificado(empresaId, async () => {
        if (!auth.currentUser) throw new Error("La sesión se cerró");
        return auth.currentUser.getIdToken();
      }),
    [empresaId],
  );

  const actualizar = setEstado;

  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    cliente()
      .estado()
      .then((e) => vigente && actualizar(e))
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [empresaId, cliente, actualizar]);

  async function ejecutar(accion: () => Promise<EstadoCertificado>, exito: string) {
    setOcupado(true);
    try {
      actualizar(await accion());
      toast.success(exito);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la operación");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function generar() {
    const ok = await ejecutar(() => cliente().generarPedido(), "Pedido generado. Descargalo y subilo a ARCA.");
    if (ok) setArchivo(null);
  }

  async function cargar() {
    if (!archivo) return;
    const texto = await leerCertificado(archivo);
    const ok = await ejecutar(() => cliente().cargar(texto, entorno), "Certificado cargado. Ya se pueden emitir facturas.");
    if (ok) setArchivo(null);
  }

  const { activo, pendiente } = estado ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileKeyIcon className="size-4" /> Certificado de ARCA
          {activo && (
            <Badge variant="outline" className="ml-1">
              <ShieldCheckIcon /> {activo.entorno === "produccion" ? "Activo" : "De prueba"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Con el certificado, el sistema pide los CAE a ARCA en nombre del comercio. Se tramita una sola vez y dura
          dos años.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 text-sm">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : !estado ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            {activo && (
              <div className="rounded-lg border p-3">
                <p>
                  CUIT {formatCuit(activo.cuit)} · {ENTORNOS[activo.entorno]} · vence el {formatDate(activo.vence)}
                </p>
                {activo.entorno === "homologacion" && (
                  <p className="text-muted-foreground">Los comprobantes de prueba no tienen validez fiscal.</p>
                )}
              </div>
            )}

            {!pendiente ? (
              <div className="grid gap-2">
                <p className="font-medium">{activo ? "Renovar o reemplazar el certificado" : "Paso 1 · Generar el pedido"}</p>
                <p className="text-muted-foreground">
                  Se usa el CUIT guardado arriba. {activo && "El certificado actual sigue funcionando hasta que cargues el nuevo."}
                </p>
                <div>
                  <Button variant="outline" onClick={() => void generar()} disabled={ocupado}>
                    {ocupado ? <Loader2Icon className="animate-spin" /> : <FileKeyIcon />} Generar pedido de certificado
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <p className="font-medium">Paso 1 · Descargar el pedido</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => descargar(`pedido-arca-${pendiente.cuit}.csr`, pendiente.pedido)}>
                      <DownloadIcon /> Descargar pedido (.csr)
                    </Button>
                    <Button variant="ghost" onClick={() => void generar()} disabled={ocupado}>
                      Generar otro
                    </Button>
                  </div>
                </div>

                <div className="grid gap-1">
                  <p className="font-medium">Paso 2 · Tramitarlo en ARCA con la clave fiscal del comercio</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>
                      En <b>Administración de Certificados Digitales</b>, agregar un alias, subir el pedido y descargar
                      el certificado (.crt). Para pruebas se usa el servicio <b>WSASS</b>.
                    </li>
                    <li>
                      En <b>Administrador de Relaciones de Clave Fiscal</b>, crear una relación con el servicio{" "}
                      <b>Facturación electrónica</b> para ese alias (computador fiscal).
                    </li>
                    <li>
                      En <b>Administración de puntos de venta</b>, dar de alta un punto de venta para web services y
                      cargar su número arriba.
                    </li>
                  </ol>
                </div>

                <div className="grid gap-3">
                  <p className="font-medium">Paso 3 · Subir el certificado</p>
                  <input
                    type="file"
                    accept=".crt,.cer,.pem"
                    aria-label="Archivo del certificado"
                    onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                    className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
                  />
                  <RadioGroup
                    value={entorno}
                    onValueChange={(v) => setEntorno(v as typeof entorno)}
                    className="flex flex-wrap gap-4"
                  >
                    {(Object.keys(ENTORNOS) as (keyof typeof ENTORNOS)[]).map((e) => (
                      <div key={e} className="flex items-center gap-2">
                        <RadioGroupItem value={e} id={`entorno-${e}`} />
                        <Label htmlFor={`entorno-${e}`} className="font-normal">
                          {ENTORNOS[e]}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      {pendiente && (
        <CardFooter className="justify-end">
          <Button onClick={() => void cargar()} disabled={ocupado || !archivo}>
            {ocupado ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Cargar certificado
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
