import { respuestaDeError, usuarioDelPedido, validarAcceso, ErrorPedido } from "@/server/acceso";
import { adminDb } from "@/server/firebase-admin";
import { ejecutarOperacion } from "@/server/operaciones/ejecutar";
import { leerPedido } from "@/server/operaciones/pedido";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const empresa = new URL(request.url).searchParams.get("empresaId") ?? "";
    const acceso = await validarAcceso(uid, empresa);
    const base = adminDb().doc(`empresas/${empresa}`);
    const lock = (await base.collection("control").doc("escritura").get()).data();
    if (!lock?.id) return Response.json({ pendiente: null });
    const op = (await base.collection("operaciones").doc(lock.id).get()).data();
    if (!acceso.admin && op?.uid !== uid) return Response.json({ pendiente: { id: lock.id, propia: false } });
    return Response.json(
      {
        pendiente: {
          id: lock.id,
          propia: op?.uid === uid,
          accion: op?.pedido?.accion,
          error: op?.error,
          tomada: lock.tomada,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return respuestaDeError(e);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const { empresaId } = await request.json();
    const acceso = await validarAcceso(uid, empresaId);
    const base = adminDb().doc(`empresas/${empresaId}`);
    const lock = (await base.collection("control").doc("escritura").get()).data();
    if (!lock?.id) throw new ErrorPedido("No hay operación pendiente", 404);
    const ref = base.collection("operaciones").doc(lock.id);
    const op = (await ref.get()).data();
    if (!op || (!acceso.admin && op.uid !== uid)) throw new ErrorPedido("No podés reanudar este pedido", 403);
    const pedido = leerPedido(op.pedido);
    if (pedido.empresaId !== empresaId || pedido.id !== lock.id)
      throw new ErrorPedido("La operación requiere revisión manual", 409);
    await ref.update({ reanudadaPor: uid });
    await ejecutarOperacion(op.uid, pedido);
    // No devolver costos al vendedor que reanuda.
    return Response.json({ completada: true });
  } catch (e) {
    return respuestaDeError(e, (error) =>
      error instanceof Error ? Response.json({ error: error.message }, { status: 422 }) : undefined,
    );
  }
}
