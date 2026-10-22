import { codigoArca, tipoComprobanteSugerido } from "@/domain/comprobante";
import { cuitValido } from "@/domain/identificadores";
import type {
  ClaseComprobante,
  Comercio,
  ComprobanteAsociado,
  CondicionIva,
  TotalesComprobante,
} from "@/domain/types";
import {
  CONDICION_IVA_RECEPTOR,
  importesArca,
  tipoDocumento,
  urlQrComprobante,
} from "@/integrations/fiscal/arca-datos";
import type { Autorizacion, TipoFiscal } from "@/integrations/fiscal/fiscal-provider";
import { ErrorPedido, validarAcceso } from "../acceso";
import { adminDb } from "../firebase-admin";
import { almacenTicket, credencialActiva } from "./credenciales";
import { ErrorArca } from "./soap";
import { obtenerTicket } from "./wsaa";
import { solicitarCae, ultimoAutorizado, type DetalleComprobante } from "./wsfe";

/** Lo que manda el navegador. Los datos del emisor nunca salen de acá: se leen de Firestore. */
export interface PedidoAutorizacion {
  empresaId: string;
  clase: ClaseComprobante;
  tipo: TipoFiscal;
  totales: TotalesComprobante;
  clienteCondicionIva: CondicionIva;
  clienteDocumento: string;
  asociado?: ComprobanteAsociado;
}

/** Número de comprobante distinto al próximo: otra caja autorizó uno en el medio. */
const NUMERO_NO_CORRELATIVO = "10016";

/** "aaaammdd" en la hora de Argentina. */
function fechaArca(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(fecha)
    .replace(/-/g, "");
}

const deFechaArca = (f: string) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;

async function leerComercio(empresaId: string): Promise<Comercio> {
  const comercio = (await adminDb().doc(`empresas/${empresaId}/config/comercio`).get()).data() as Comercio | undefined;
  if (!comercio) throw new ErrorPedido("La empresa no tiene cargados los datos del comercio", 400);
  if (!cuitValido(comercio.cuit)) throw new ErrorPedido("El CUIT del comercio no es válido", 400);
  return comercio;
}

function validarTipo(comercio: Comercio, pedido: PedidoAutorizacion) {
  const esperado = tipoComprobanteSugerido(comercio.condicionIva, pedido.clienteCondicionIva);
  // En una nota de crédito alcanza con que la letra sea la del emisor (A y B son las dos de un inscripto).
  const valido =
    pedido.clase === "factura"
      ? pedido.tipo === esperado
      : (pedido.tipo === "C") === (esperado === "C");
  if (!valido) throw new ErrorPedido("El tipo de comprobante no corresponde a la condición de IVA", 400);
  if (pedido.clase === "nota_credito" && !pedido.asociado) {
    throw new ErrorPedido("La nota de crédito tiene que indicar la factura que anula", 400);
  }
}

export async function autorizarComprobante(uid: string, pedido: PedidoAutorizacion): Promise<Autorizacion> {
  const { demo } = await validarAcceso(uid, pedido.empresaId, { soloAdmin: pedido.clase === "nota_credito" });
  if (demo) throw new ErrorPedido("Las empresas de demostración no facturan con ARCA", 400);
  const comercio = await leerComercio(pedido.empresaId);
  validarTipo(comercio, pedido);

  const credencial = await credencialActiva(pedido.empresaId);
  if (!credencial) {
    throw new ErrorPedido("Para emitir facturas, cargá el certificado de ARCA en Configuración. Mientras tanto, emití una nota de pedido.", 400);
  }
  if (credencial.cuit !== comercio.cuit) {
    throw new ErrorPedido("El certificado de ARCA es de otra CUIT: generá uno nuevo en Configuración", 400);
  }

  let importes;
  try {
    importes = importesArca(pedido.tipo, pedido.totales);
  } catch (e) {
    throw new ErrorPedido(e instanceof Error ? e.message : "Importes inválidos", 400);
  }

  const { entorno, cuit } = credencial;
  const codigo = codigoArca(pedido.clase, pedido.tipo);
  const receptor = tipoDocumento(pedido.clienteDocumento);
  const hoy = fechaArca(new Date());
  const ticket = await obtenerTicket(credencial, almacenTicket(pedido.empresaId));

  const detalle = (numero: number): DetalleComprobante => ({
    puntoVenta: comercio.puntoVenta,
    codigoComprobante: codigo,
    numero,
    fecha: hoy,
    documentoTipo: receptor.tipo,
    documentoNumero: receptor.numero,
    condicionIvaReceptor: CONDICION_IVA_RECEPTOR[pedido.clienteCondicionIva],
    importes,
    asociado: pedido.asociado && {
      codigoComprobante: codigoArca("factura", pedido.asociado.tipo as TipoFiscal),
      puntoVenta: pedido.asociado.puntoVenta,
      numero: pedido.asociado.numero,
      cuit,
      fecha: fechaArca(new Date(pedido.asociado.fecha)),
    },
  });

  // ARCA exige numeración correlativa: se pide el último y se usa el siguiente.
  // Si otra caja ganó ese número en el medio, se reintenta una vez.
  let numero = (await ultimoAutorizado(entorno, ticket, cuit, comercio.puntoVenta, codigo)) + 1;
  let cae;
  try {
    cae = await solicitarCae(entorno, ticket, cuit, detalle(numero));
  } catch (e) {
    if (!(e instanceof ErrorArca) || !e.codigos.includes(NUMERO_NO_CORRELATIVO)) throw e;
    numero = (await ultimoAutorizado(entorno, ticket, cuit, comercio.puntoVenta, codigo)) + 1;
    cae = await solicitarCae(entorno, ticket, cuit, detalle(numero));
  }

  return {
    numero,
    cae: cae.cae,
    caeVencimiento: deFechaArca(cae.vencimiento),
    qrUrl: urlQrComprobante({
      // Mediodía UTC: cae el mismo día en cualquier huso de Argentina.
      fecha: `${deFechaArca(hoy)}T12:00:00Z`,
      cuit,
      puntoVenta: comercio.puntoVenta,
      codigoComprobante: codigo,
      numero,
      total: importes.total,
      clienteDocumento: pedido.clienteDocumento,
      cae: cae.cae,
    }),
    // Los CAE de homologación (pruebas) no tienen validez fiscal.
    ...(entorno === "homologacion" ? { simulado: true } : {}),
  };
}
