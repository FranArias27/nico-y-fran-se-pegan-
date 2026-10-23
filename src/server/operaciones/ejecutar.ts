import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { separarVenta, unirVenta } from "@/data/costos";
import type { Recibo, Venta } from "@/domain/types";
import type { Autorizacion, FiscalProvider } from "@/integrations/fiscal/fiscal-provider";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { pagosNoDisponibles } from "@/integrations/payments/no-disponible";
import { ErrorDeNegocio, type Contexto } from "@/services/contexto";
import { registrarPago } from "@/services/cuenta-corriente";
import { emitirNotaCredito, registrarVenta } from "@/services/ventas";
import { ErrorPedido, validarAcceso } from "../acceso";
import { crearArcaServidor, RechazoFiscal, type IntentoFiscal } from "../arca/autorizar";
import { conExclusion, huella } from "../exclusion";
import { adminDb } from "../firebase-admin";
import { crearStoreAdmin } from "../store-admin";
import { tieneDescuentos, type Pedido } from "./pedido";
import { exigirCaja, registrarEfectivo } from "../gestion";
import { actualizarCartera } from "../cartera";

export async function ejecutarOperacion(uid: string, pedido: Pedido): Promise<Venta | Recibo> {
  const { empresaId, id, accion } = pedido;
  const acceso = await validarAcceso(uid, empresaId, { soloAdmin: accion === "nota_credito" });
  if (pedido.accion === "venta" && tieneDescuentos(pedido.datos) && !acceso.admin) {
    throw new ErrorPedido("Solo un administrador puede aplicar descuentos", 403);
  }
  const medios =
    pedido.accion === "venta"
      ? pedido.datos.pagos.filter((p) => p.importe > 0).map((p) => p.medio)
      : pedido.accion === "pago"
        ? [pedido.datos.medio]
        : [pedido.datos.reintegro];
  if (!acceso.demo && medios.includes("qr")) throw new ErrorDeNegocio("Mercado Pago todavía no está integrado");
  const db = adminDb();
  const registrado = await conExclusion(db, empresaId, id, uid, pedido, async (exclusion) => {
    const store = crearStoreAdmin(db, empresaId, exclusion);
    const hecho = accion === "pago" ? await store.recibos.obtener(id) : await store.ventas.obtener(id);
    if (hecho) {
      exclusion.proteger();
      await exclusion.guardar({ protegida: true });
      await registrarEfectivo(db, empresaId, hecho, exclusion);
      await actualizarCartera(db, empresaId, hecho.clienteId, exclusion);
      return hecho;
    }
    if (medios.includes("efectivo")) await exigirCaja(db, empresaId);
    const fiscalBase: FiscalProvider = acceso.demo
      ? crearArcaSimulado({ demoraMs: 0, numerar: (clave) => store.contadores.siguiente(clave) })
      : crearArcaServidor(empresaId, {
          intento: exclusion.datos.intentoFiscal as IntentoFiscal | undefined,
          guardar: async (intentoFiscal) => {
            exclusion.proteger();
            await exclusion.guardar({ intentoFiscal, protegida: true });
          },
        });
    const fiscal: FiscalProvider = {
      async autorizar(solicitud) {
        const firma = huella(solicitud);
        const anterior = exclusion.datos.fiscal as { firma: string; autorizacion: Autorizacion } | undefined;
        if (anterior) {
          if (anterior.firma !== firma)
            throw new ErrorDeNegocio("El comprobante autorizado cambió. Requiere revisión del administrador.");
          return anterior.autorizacion;
        }
        let autorizacion: Autorizacion;
        try {
          autorizacion = await fiscalBase.autorizar(solicitud);
        } catch (error) {
          if (error instanceof RechazoFiscal) {
            await exclusion.guardar({ intentoFiscal: FieldValue.delete(), protegida: false });
            exclusion.desproteger();
          }
          throw error;
        }
        exclusion.proteger();
        await exclusion.guardar({ fiscal: { firma, autorizacion }, protegida: true });
        return autorizacion;
      },
    };
    const fecha = (exclusion.datos.fecha as string | undefined) ?? new Date().toISOString();
    await exclusion.guardar({ fecha });
    const ctx: Contexto = {
      store,
      fiscal,
      pagos: pagosNoDisponibles,
      ahora: () => new Date(fecha),
      nuevoId: randomUUID,
    };
    const usuario = { vendedorId: uid, vendedorNombre: acceso.nombre || undefined };
    const resultado =
      pedido.accion === "venta"
        ? await registrarVenta(ctx, { ...pedido.datos, id, ...usuario })
        : pedido.accion === "nota_credito"
          ? await emitirNotaCredito(ctx, { ...pedido.datos, id, ...usuario })
          : await registrarPago(ctx, { ...pedido.datos, id, usuarioId: uid });
    exclusion.proteger();
    await exclusion.guardar({ protegida: true });
    await registrarEfectivo(db, empresaId, resultado, exclusion);
    await actualizarCartera(db, empresaId, resultado.clienteId, exclusion);
    return resultado;
  });
  return acceso.admin || !("lineas" in registrado) ? registrado : unirVenta(separarVenta(registrado).publica);
}
