import { respuestaDeError, usuarioDelPedido, validarAcceso, ErrorPedido } from "@/server/acceso";
import { adminDb } from "@/server/firebase-admin";
import { ejecutarGestion } from "@/server/gestion";
import type { PedidoGestion } from "@/domain/gestion";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const url = new URL(request.url),
      empresa = url.searchParams.get("empresaId") ?? "";
    await validarAcceso(uid, empresa, { soloAdmin: true });
    const base = adminDb().doc(`empresas/${empresa}`);
    const cursor = url.searchParams.get("antes");
    if (cursor && !Number.isFinite(Date.parse(cursor))) throw new ErrorPedido("Cursor inválido", 400);
    let compras = base.collection("compras").orderBy("fecha", "desc").limit(50);
    if (cursor) compras = compras.startAfter(cursor);
    const [caja, proveedores, lista, inventario, cajas] = await Promise.all([
      base.collection("caja").doc("actual").get(),
      base.collection("proveedores").orderBy("nombre").get(),
      compras.get(),
      base.collection("inventarioMovimientos").orderBy("fecha", "desc").limit(50).get(),
      base.collection("cajas").orderBy("abiertaEn", "desc").limit(20).get(),
    ]);
    return Response.json(
      {
        caja: caja.data() ?? null,
        proveedores: proveedores.docs.map((d) => d.data()),
        compras: lista.docs.map((d) => d.data()),
        inventario: inventario.docs.map((d) => d.data()),
        cajas: cajas.docs.map((d) => d.data()),
        siguiente: lista.size === 50 ? lista.docs.at(-1)!.data().fecha : null,
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
    const { empresaId, id, pedido } = await request.json();
    await validarAcceso(uid, empresaId, { soloAdmin: true });
    const resultado = await ejecutarGestion(adminDb(), empresaId, uid, id, pedido as PedidoGestion);
    return Response.json(resultado);
  } catch (e) {
    return respuestaDeError(e, (error) =>
      error instanceof Error
        ? Response.json(
            { error: error.message, pendiente: "pendiente" in error && error.pendiente === true },
            { status: 422 },
          )
        : undefined,
    );
  }
}
