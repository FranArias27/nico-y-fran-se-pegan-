import type { Autorizacion, FiscalProvider } from "./fiscal-provider";

/**
 * Autorización real: le pide el CAE al servidor (/api/arca/autorizar), que
 * habla con ARCA. Los datos del emisor los lee el servidor de Firestore.
 */
export function crearArcaRemoto(opciones: { empresaId: string; token: () => Promise<string> }): FiscalProvider {
  return {
    async autorizar(s) {
      let respuesta: Response;
      try {
        respuesta = await fetch("/api/arca/autorizar", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await opciones.token()}` },
          body: JSON.stringify({
            empresaId: opciones.empresaId,
            clase: s.clase,
            tipo: s.tipo,
            totales: s.totales,
            clienteCondicionIva: s.clienteCondicionIva,
            clienteDocumento: s.clienteDocumento,
            asociado: s.asociado,
          }),
        });
      } catch {
        throw new Error("Sin conexión con el servidor. Revisá internet o emití una nota de pedido.");
      }
      const datos = (await respuesta.json().catch(() => ({}))) as Partial<Autorizacion> & { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? `Error ${respuesta.status}`);
      return datos as Autorizacion;
    },
  };
}
