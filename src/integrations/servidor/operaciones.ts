import type { Recibo, Venta } from "@/domain/types";
import { ErrorDeNegocio } from "@/services/contexto";
import type { NuevoPago } from "@/services/cuenta-corriente";
import type { NuevaNotaCredito, NuevaVenta } from "@/services/ventas";

const REINTENTOS = 3;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ventas, notas de crédito y pagos se registran en el servidor
 * (/api/operaciones), que recalcula los importes con el catálogo, pide el CAE
 * y guarda todo. Cada operación lleva un id propio: si se corta la conexión,
 * se reintenta con el mismo id y el servidor no la duplica.
 */
export function crearOperacionesRemotas(opciones: { empresaId: string; token: () => Promise<string> }) {
  async function enviar<T>(accion: string, datos: object): Promise<T> {
    const id = crypto.randomUUID();
    const cuerpo = JSON.stringify({ empresaId: opciones.empresaId, id, accion, datos });
    for (let intento = 1; ; intento++) {
      let respuesta: Response;
      try {
        respuesta = await fetch("/api/operaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await opciones.token()}` },
          body: cuerpo,
        });
      } catch {
        if (intento < REINTENTOS) {
          await esperar(2000 * intento);
          continue;
        }
        throw new ErrorDeNegocio(
          "Sin conexión con el servidor. Antes de repetir la operación, revisá en Ventas o en la cuenta del cliente si quedó registrada.",
        );
      }
      const respuestaJson = (await respuesta.json().catch(() => ({}))) as { resultado?: T; error?: string };
      // 409: el intento anterior todavía se está procesando en el servidor.
      if (respuesta.status === 409 && intento < REINTENTOS) {
        await esperar(5000);
        continue;
      }
      if (!respuesta.ok) throw new ErrorDeNegocio(respuestaJson.error ?? `Error del servidor (${respuesta.status})`);
      return respuestaJson.resultado as T;
    }
  }

  return {
    // El vendedor lo toma el servidor de la sesión: no se manda.
    registrarVenta: ({ tipo, clienteId, items, descuentoTotal, pagos }: NuevaVenta) =>
      enviar<Venta>("venta", { tipo, clienteId, items, descuentoTotal, pagos }),
    emitirNotaCredito: ({ ventaId, devoluciones, reintegro, reponerStock }: NuevaNotaCredito) =>
      enviar<Venta>("nota_credito", { ventaId, devoluciones, reintegro, reponerStock }),
    registrarPago: ({ clienteId, importe, medio, debitoIds }: NuevoPago) =>
      enviar<Recibo>("pago", { clienteId, importe, medio, debitoIds }),

    /** Reinicia la empresa de demostración con los datos de ejemplo (ver /api/demo). */
    async reiniciarDemo(): Promise<void> {
      const respuesta = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await opciones.token()}` },
        body: JSON.stringify({ empresaId: opciones.empresaId }),
      }).catch(() => {
        throw new ErrorDeNegocio("Sin conexión con el servidor. Revisá internet y probá de nuevo.");
      });
      if (!respuesta.ok) {
        const { error } = (await respuesta.json().catch(() => ({}))) as { error?: string };
        throw new ErrorDeNegocio(error ?? `No se pudo reiniciar la demo (${respuesta.status})`);
      }
    },
  };
}
