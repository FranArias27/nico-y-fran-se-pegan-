import { ErrorPedido, respuestaDeError, usuarioDelPedido, validarAcceso } from "@/server/acceso";
import { reiniciarDemo } from "@/server/demo";

export const maxDuration = 60;

/** Reinicia una empresa de demostración con los datos de ejemplo. Solo para administradores. */
export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const cuerpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (typeof cuerpo.empresaId !== "string") throw new ErrorPedido("Empresa inválida", 400);
    const { demo } = await validarAcceso(uid, cuerpo.empresaId, { soloAdmin: true });
    // Las empresas reales nunca se borran.
    if (!demo) throw new ErrorPedido("Solo se puede reiniciar una empresa de demostración", 400);
    await reiniciarDemo(cuerpo.empresaId, new Date());
    return Response.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
