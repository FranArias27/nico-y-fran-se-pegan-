import { cuitValido } from "@/domain/identificadores";
import type { Comercio } from "@/domain/types";
import { ErrorPedido, respuestaDeError, usuarioDelPedido, validarAcceso } from "@/server/acceso";
import { cargarCertificado, crearPedido, ErrorCertificado, estadoCredencial } from "@/server/arca/credenciales";
import { adminDb } from "@/server/firebase-admin";

/** Gestión del certificado de ARCA de un comercio. Solo para administradores de la empresa. */

const errorCertificado = (e: unknown) =>
  e instanceof ErrorCertificado ? Response.json({ error: e.message }, { status: 400 }) : undefined;

export async function GET(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const empresaId = new URL(request.url).searchParams.get("empresa") ?? "";
    await validarAcceso(uid, empresaId, { soloAdmin: true });
    return Response.json(await estadoCredencial(empresaId));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const cuerpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const empresaId = typeof cuerpo.empresaId === "string" ? cuerpo.empresaId : "";
    const { demo } = await validarAcceso(uid, empresaId, { soloAdmin: true });
    if (demo) throw new ErrorPedido("Las empresas de demostración no usan certificado de ARCA", 400);

    if (cuerpo.accion === "generar") {
      const comercio = (await adminDb().doc(`empresas/${empresaId}/config/comercio`).get()).data() as Comercio | undefined;
      if (!comercio || !cuitValido(comercio.cuit)) {
        throw new ErrorPedido("Primero cargá y guardá el CUIT del comercio", 400);
      }
      return Response.json(await crearPedido(empresaId, { cuit: comercio.cuit, razonSocial: comercio.razonSocial }));
    }

    if (cuerpo.accion === "cargar") {
      const { certificado, entorno } = cuerpo;
      if (typeof certificado !== "string" || certificado.length > 20_000) {
        throw new ErrorPedido("Subí el archivo .crt del certificado", 400);
      }
      if (entorno !== "homologacion" && entorno !== "produccion") throw new ErrorPedido("Entorno inválido", 400);
      return Response.json(await cargarCertificado(empresaId, certificado, entorno));
    }

    throw new ErrorPedido("Acción inválida", 400);
  } catch (e) {
    return respuestaDeError(e, errorCertificado);
  }
}
