import { randomUUID } from "node:crypto";
import { separarVenta, unirVenta } from "@/data/costos";
import type { Recibo, Venta } from "@/domain/types";
import type { Autorizacion, FiscalProvider, SolicitudAutorizacion } from "@/integrations/fiscal/fiscal-provider";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { ErrorDeNegocio, type Contexto } from "@/services/contexto";
import { registrarPago } from "@/services/cuenta-corriente";
import { emitirNotaCredito, registrarVenta } from "@/services/ventas";
import { ErrorPedido, validarAcceso } from "../acceso";
import { crearArcaServidor } from "../arca/autorizar";
import { adminDb } from "../firebase-admin";
import { crearStoreAdmin } from "../store-admin";
import { tieneDescuentos, type Pedido } from "./pedido";

/**
 * Si un pedido sigue "en curso" más de este tiempo, se considera abandonado
 * (se cortó la conexión o se cayó el servidor) y un reintento lo retoma.
 */
const ABANDONO_MS = 90_000;

/** Autorización fiscal guardada en la operación apenas se obtiene. */
interface FiscalGuardado {
  autorizacion: Autorizacion;
  clase: SolicitudAutorizacion["clase"];
  tipo: SolicitudAutorizacion["tipo"];
  total: number;
}

/**
 * Registra una venta, una nota de crédito o un pago desde el servidor:
 * valida permisos, toma precios y costos del catálogo guardado, pide el CAE y
 * guarda todo con el Admin SDK. Los datos del navegador solo dicen qué se
 * vende y cómo se paga.
 *
 * Cada pedido tiene un id elegido por el navegador, que es también el id de
 * la venta o el recibo. En `empresas/{id}/operaciones/{id}` queda la traza:
 * - Si el mismo pedido llega dos veces (se cortó la conexión y el navegador
 *   reintenta), se devuelve lo ya registrado en vez de duplicarlo.
 * - El CAE se guarda ahí antes de registrar la venta. Si algo falla después,
 *   no se pierde: el reintento lo reutiliza en vez de pedir otro, y una
 *   operación con `fiscal` y sin `completada` es un comprobante autorizado
 *   que no quedó registrado.
 */
export async function ejecutarOperacion(uid: string, pedido: Pedido): Promise<Venta | Recibo> {
  const { empresaId, id, accion } = pedido;
  const acceso = await validarAcceso(uid, empresaId, { soloAdmin: accion === "nota_credito" });

  if (pedido.accion === "venta") {
    if (tieneDescuentos(pedido.datos) && !acceso.admin) {
      throw new ErrorPedido("Solo un administrador puede aplicar descuentos", 403);
    }
    if (!acceso.demo && pedido.datos.pagos.some((p) => p.medio === "qr")) {
      throw new ErrorDeNegocio("El cobro con QR de Mercado Pago todavía no está disponible");
    }
  }

  const db = adminDb();
  const store = crearStoreAdmin(db, empresaId);
  const operacion = db.doc(`empresas/${empresaId}/operaciones/${id}`);
  const resultado = db.doc(`empresas/${empresaId}/${accion === "pago" ? "recibos" : "ventas"}/${id}`);
  const leerResultado = async () =>
    accion === "pago" ? (await store.recibos.obtener(id))! : (await store.ventas.obtener(id))!;
  const paraElUsuario = (r: Venta | Recibo) =>
    // Sin permiso, la venta vuelve sin costos (ver src/data/costos.ts).
    acceso.admin || !("lineas" in r) ? r : unirVenta(separarVenta(r).publica);

  // Se toma la operación en una transacción, para que dos pedidos iguales no la procesen a la vez.
  const ahora = () => new Date().toISOString();
  const tomada = await db.runTransaction(async (tx) => {
    const [op, hecho] = await tx.getAll(operacion, resultado);
    if (hecho.exists) return { hecha: true as const };
    if (!op.exists) {
      tx.create(operacion, { accion, uid, creada: ahora(), tomada: ahora() });
      return { hecha: false as const };
    }
    const datos = op.data()!;
    if (datos.accion !== accion || datos.uid !== uid) throw new ErrorPedido("La operación no corresponde", 409);
    if (Date.now() - Date.parse(datos.tomada) < ABANDONO_MS) {
      throw new ErrorPedido("La operación se está procesando. Esperá unos segundos.", 409);
    }
    tx.update(operacion, { tomada: ahora() });
    return { hecha: false as const, fiscal: datos.fiscal as FiscalGuardado | undefined };
  });
  if (tomada.hecha) return paraElUsuario(await leerResultado());

  const fiscalBase: FiscalProvider = acceso.demo
    ? crearArcaSimulado({ demoraMs: 0, numerar: (clave) => store.contadores.siguiente(clave) })
    : crearArcaServidor(empresaId);
  let autorizado = tomada.fiscal;
  const fiscal: FiscalProvider = {
    async autorizar(s) {
      if (autorizado) {
        if (autorizado.clase === s.clase && autorizado.tipo === s.tipo && autorizado.total === s.totales.total) {
          return autorizado.autorizacion;
        }
        throw new ErrorDeNegocio(
          "Esta operación ya tiene un comprobante autorizado por otro importe. Revisalo en Ventas antes de repetirla.",
        );
      }
      const autorizacion = await fiscalBase.autorizar(s);
      autorizado = { autorizacion, clase: s.clase, tipo: s.tipo, total: s.totales.total };
      await operacion.update({ fiscal: autorizado });
      return autorizacion;
    },
  };

  const ctx: Contexto = {
    store,
    fiscal,
    pagos: crearMercadoPagoSimulado(),
    ahora: () => new Date(),
    nuevoId: () => randomUUID(),
  };
  const usuario = { vendedorId: uid, vendedorNombre: acceso.nombre || undefined };

  try {
    const registrado =
      pedido.accion === "venta"
        ? await registrarVenta(ctx, { ...pedido.datos, id, ...usuario })
        : pedido.accion === "nota_credito"
          ? await emitirNotaCredito(ctx, { ...pedido.datos, id, ...usuario })
          : await registrarPago(ctx, { ...pedido.datos, id, usuarioId: uid });
    await operacion.update({ completada: ahora() });
    return paraElUsuario(registrado);
  } catch (e) {
    // Con un comprobante autorizado, la operación se conserva y queda libre para que un reintento lo use.
    // Sin él no hay nada que conservar: se puede volver a intentar con el mismo id.
    const liberar = autorizado
      ? operacion.update({ error: e instanceof Error ? e.message : String(e), tomada: "" })
      : operacion.delete();
    await liberar.catch((falla: unknown) => console.error(falla));
    throw e;
  }
}
