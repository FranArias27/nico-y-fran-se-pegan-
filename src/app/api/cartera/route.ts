import { respuestaDeError, usuarioDelPedido, validarAcceso } from "@/server/acceso";
import { adminDb } from "@/server/firebase-admin";
import { leerCartera } from "@/server/cartera";

export async function GET(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const empresa = new URL(request.url).searchParams.get("empresaId") ?? "";
    await validarAcceso(uid, empresa);
    return Response.json(await leerCartera(adminDb(), empresa), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return respuestaDeError(e);
  }
}
