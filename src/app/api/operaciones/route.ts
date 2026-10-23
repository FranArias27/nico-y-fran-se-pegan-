import { respuestaDeError, usuarioDelPedido } from "@/server/acceso";
import { ErrorArca } from "@/server/arca/soap";
import { ejecutarOperacion } from "@/server/operaciones/ejecutar";
import { leerPedido } from "@/server/operaciones/pedido";
import { ErrorDeNegocio } from "@/services/contexto";

/** Las llamadas a ARCA pueden tardar (cada una espera hasta 30 segundos). */
export const maxDuration = 60;

/** Registra una venta, una nota de crédito o un pago. Ver src/server/operaciones/ejecutar.ts. */
export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const pedido = leerPedido(await request.json().catch(() => null));
    return Response.json({ resultado: await ejecutarOperacion(uid, pedido) });
  } catch (e) {
    const respuesta = respuestaDeError(e, (e) => {
      // Las reglas de negocio y los rechazos de ARCA se muestran tal cual: explican qué corregir.
      if (e instanceof ErrorDeNegocio) return Response.json({ error: e.message }, { status: 422 });
      if (e instanceof ErrorArca) return Response.json({ error: e.message, codigos: e.codigos }, { status: 502 });
      return undefined;
    });
    return Response.json({ ...await respuesta.json(), pendiente: e instanceof Error && "pendiente" in e && e.pendiente === true }, { status: respuesta.status });
  }
}
