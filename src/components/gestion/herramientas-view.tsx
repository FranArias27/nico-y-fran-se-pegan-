"use client";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { pedirApi, descargarApi } from "@/lib/api-cliente";
import { useConsulta } from "@/hooks/use-consulta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

interface VistaPrevia {
  nuevos: number;
  actualizados: number;
  errores: string[];
  totalErrores: number;
}
interface Pendiente {
  id: string;
  accion?: string;
  error?: string;
  propia: boolean;
}

export function HerramientasView() {
  const { perfil, cuenta, puede } = useAuth();
  const empresa = perfil!.empresaId,
    admin = puede("configurar");
  const [ocupado, setOcupado] = useState(false),
    [version, setVersion] = useState(0);
  const [archivo, setArchivo] = useState<File | null>(null),
    [idImportacion, setIdImportacion] = useState("");
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [claveImportacion, setClaveImportacion] = useState("");
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { datos, error } = useConsulta(
    async () =>
      (await pedirApi(`/api/operaciones/pendiente?empresaId=${empresa}`)).json() as Promise<{
        pendiente: Pendiente | null;
      }>,
    [empresa, version],
  );
  async function tarea(fn: () => Promise<void>) {
    setOcupado(true);
    try {
      await fn();
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setOcupado(false);
    }
  }
  async function elegirArchivo(file: File | null) {
    setArchivo(null);
    setPrevia(null);
    setIdImportacion("");
    if (!file) return;
    if (file.size > 3_000_000 || !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Elegí un .xlsx de hasta 3 MB");
      return;
    }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const clave = `el-tornillo:importacion:${empresa}:${cuenta?.uid}:${hash}`;
    const id = sessionStorage.getItem(clave) ?? crypto.randomUUID();
    sessionStorage.setItem(clave, id);
    setClaveImportacion(clave);
    setIdImportacion(id);
    setArchivo(file);
  }
  async function importar(confirmar: boolean) {
    if (!archivo || !idImportacion) return;
    const form = new FormData();
    form.set("empresaId", empresa);
    form.set("id", idImportacion);
    form.set("archivo", archivo);
    if (confirmar) form.set("confirmar", "si");
    const respuesta = await pedirApi("/api/herramientas", { method: "POST", body: form });
    const json = await respuesta.json();
    if (confirmar) {
      toast.success(`${json.importados} artículos importados`);
      sessionStorage.removeItem(claveImportacion);
      setArchivo(null);
      setPrevia(null);
    } else setPrevia(json);
  }
  function locales(): { clave: string; cuerpo: string; accion: string }[] {
    if (!enNavegador) return [];
    const pedidos = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const clave = sessionStorage.key(i)!;
      if (
        !clave.startsWith(`el-tornillo:pendiente:${empresa}:${cuenta?.uid}:`) &&
        clave !== `el-tornillo:gestion:${empresa}:${cuenta?.uid}`
      )
        continue;
      try {
        const valor = JSON.parse(sessionStorage.getItem(clave)!);
        const pedido = JSON.parse(valor.cuerpo);
        pedidos.push({ clave, cuerpo: valor.cuerpo, accion: pedido.accion ?? pedido.pedido?.accion });
      } catch {
        /* Un valor ajeno no se envía. */
      }
    }
    return pedidos;
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 md:p-6">
      <PageHeader titulo="Herramientas" descripcion="Recuperación de pedidos y administración de datos." />
      <Card>
        <CardHeader>
          <CardTitle>Pedidos pendientes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {error && <p role="alert">{error.message}</p>}
          {datos?.pendiente ? (
            <>
              <p>
                Operación {datos.pendiente.id} · {datos.pendiente.accion ?? "administración"}
              </p>
              {datos.pendiente.error && <p role="alert">{datos.pendiente.error}</p>}
              <p className="text-sm text-muted-foreground">
                Una respuesta fiscal incierta conserva el pedido original. Si el servidor sigue trabajando, esperá dos
                minutos antes de retomarlo. Para una importación, volvé a cargar el mismo archivo.
              </p>
              <Button
                disabled={
                  ocupado ||
                  (!admin && !datos.pendiente.propia) ||
                  !["venta", "pago", "nota_credito"].includes(datos.pendiente.accion ?? "")
                }
                onClick={() =>
                  void tarea(async () => {
                    await pedirApi("/api/operaciones/pendiente", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ empresaId: empresa }),
                    });
                    toast.success("Operación recuperada");
                  })
                }
              >
                Reanudar operación del servidor
              </Button>
            </>
          ) : (
            <p>No hay operaciones bloqueando el comercio.</p>
          )}
          {locales().map((p) => (
            <Button
              key={p.clave}
              disabled={ocupado}
              variant="outline"
              onClick={() =>
                void tarea(async () => {
                  await pedirApi(p.clave.includes(":gestion:") ? "/api/gestion" : "/api/operaciones", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: p.cuerpo,
                  });
                  sessionStorage.removeItem(p.clave);
                  toast.success("Pedido confirmado");
                })
              }
            >
              Reintentar pedido guardado: {p.accion}
            </Button>
          ))}
          <Button variant="outline" disabled={ocupado} onClick={() => setVersion((v) => v + 1)}>
            Actualizar estado
          </Button>
        </CardContent>
      </Card>
      {admin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Importar y exportar Excel</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={ocupado}
                  onClick={() =>
                    void tarea(() =>
                      descargarApi(
                        `/api/herramientas?empresaId=${empresa}&formato=plantilla`,
                        "plantilla-articulos.xlsx",
                      ),
                    )
                  }
                >
                  Descargar plantilla
                </Button>
                <Button
                  variant="outline"
                  disabled={ocupado}
                  onClick={() =>
                    void tarea(() =>
                      descargarApi(`/api/herramientas?empresaId=${empresa}&formato=excel`, "articulos.xlsx"),
                    )
                  }
                >
                  Exportar artículos
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Usá la primera hoja de la plantilla; la segunda contiene las categorías disponibles. Importes en pesos,
                cantidades en unidades y porcentajes como 21 o 10,5. Hasta 5.000 filas por archivo. Los códigos
                existentes actualizan precios y datos, conservando stock y códigos de presentación; para cambiar stock
                usá Inventario.
              </p>
              <label className="grid gap-2 text-sm">
                Archivo Excel
                <Input
                  disabled={ocupado}
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => void tarea(() => elegirArchivo(e.target.files?.[0] ?? null))}
                />
              </label>
              <Button
                disabled={ocupado || !archivo}
                variant="outline"
                onClick={() => void tarea(() => importar(false))}
              >
                Validar y previsualizar
              </Button>
              {previa && (
                <div className="grid gap-3">
                  <p>
                    {previa.nuevos} artículos nuevos · {previa.actualizados} actualizaciones · {previa.totalErrores}{" "}
                    errores
                  </p>
                  {previa.errores.length > 0 && (
                    <ul className="max-h-64 overflow-auto text-sm text-destructive">
                      {previa.errores.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <Button
                    disabled={ocupado || previa.totalErrores > 0 || !archivo}
                    onClick={() => void tarea(() => importar(true))}
                  >
                    Confirmar importación
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Respaldo y recuperación</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Descargá una copia completa de los datos del comercio y guardala en un lugar privado. Incluye costos e
                historial. La recuperación se hace en una empresa nueva, con verificación del archivo y del contenido
                restaurado.
              </p>
              <Button
                className="w-fit"
                disabled={ocupado}
                onClick={() =>
                  void tarea(() =>
                    descargarApi(`/api/herramientas?empresaId=${empresa}&formato=respaldo`, `${empresa}-respaldo.json`),
                  )
                }
              >
                Descargar respaldo completo
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Actualizar resúmenes de cobranza</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Prepará los resúmenes de una empresa existente para que el panel general no necesite consultar su
                historial completo. Las operaciones nuevas los mantienen actualizados.
              </p>
              <Button
                className="w-fit"
                disabled={ocupado}
                onClick={() =>
                  void tarea(async () => {
                    const form = new FormData();
                    form.set("empresaId", empresa);
                    form.set("id", crypto.randomUUID());
                    form.set("accion", "reconstruir_cartera");
                    const r = await pedirApi("/api/herramientas", { method: "POST", body: form });
                    toast.success(`${(await r.json()).clientes} clientes actualizados`);
                  })
                }
              >
                Reconstruir resúmenes
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
