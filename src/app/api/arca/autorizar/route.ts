import { ErrorPedido, respuestaDeError, usuarioDelPedido } from "@/server/acceso";
import { autorizarComprobante, type PedidoAutorizacion } from "@/server/arca/autorizar";
import { ErrorArca } from "@/server/arca/soap";

const esEntero = (v: unknown): v is number => Number.isSafeInteger(v);
const esTexto = (v: unknown): v is string => typeof v === "string";

/** Valida la forma del pedido; los datos del emisor y los permisos se validan después. */
function leerPedido(cuerpo: unknown): PedidoAutorizacion {
  const p = (cuerpo ?? {}) as Record<string, unknown>;
  const t = (p.totales ?? {}) as Record<string, unknown>;
  const a = p.asociado as Record<string, unknown> | undefined;
  const valido =
    esTexto(p.empresaId) &&
    /^[a-z0-9-]{1,60}$/.test(p.empresaId) &&
    (p.clase === "factura" || p.clase === "nota_credito") &&
    (p.tipo === "A" || p.tipo === "B" || p.tipo === "C") &&
    ["RI", "MONOTRIBUTO", "CF", "EXENTO"].includes(p.clienteCondicionIva as string) &&
    esTexto(p.clienteDocumento) &&
    p.clienteDocumento.length <= 20 &&
    ["netoBruto", "descuentos", "neto", "iva", "total"].every((k) => esEntero(t[k])) &&
    (t.total as number) > 0 &&
    Array.isArray(t.ivaPorAlicuota) &&
    t.ivaPorAlicuota.every(
      (g: Record<string, unknown>) => [0, 1050, 2100, 2700].includes(g?.alicuota as number) && esEntero(g.neto) && esEntero(g.iva),
    ) &&
    (a === undefined ||
      (esTexto(a.ventaId) &&
        ["A", "B", "C"].includes(a.tipo as string) &&
        esEntero(a.puntoVenta) &&
        esEntero(a.numero) &&
        esTexto(a.fecha) &&
        !Number.isNaN(Date.parse(a.fecha))));
  if (!valido) throw new ErrorPedido("El pedido de autorización no es válido", 400);
  return p as unknown as PedidoAutorizacion;
}

export async function POST(request: Request) {
  try {
    const uid = await usuarioDelPedido(request);
    const pedido = leerPedido(await request.json().catch(() => null));
    return Response.json(await autorizarComprobante(uid, pedido));
  } catch (e) {
    // Los rechazos de ARCA se muestran tal cual: suelen explicar qué dato corregir.
    return respuestaDeError(e, (e) =>
      e instanceof ErrorArca ? Response.json({ error: e.message, codigos: e.codigos }, { status: 502 }) : undefined,
    );
  }
}
