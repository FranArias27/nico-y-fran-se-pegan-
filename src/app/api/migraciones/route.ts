import { ErrorPedido, respuestaDeError, usuarioDelPedido, validarAcceso } from "@/server/acceso";
import { separarCostos } from "@/server/migraciones";

export const maxDuration = 60;

/** Migra los datos de una empresa al formato actual. Solo para administradores. */
export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const cuerpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof cuerpo.empresaId !== "string") throw new ErrorPedido("Empresa inválida", 400);
    await validarAcceso(uid, cuerpo.empresaId, { soloAdmin: true });
    return Response.json(await separarCostos(cuerpo.empresaId));
  } catch (e) {
    return respuestaDeError(e);
  }
}
