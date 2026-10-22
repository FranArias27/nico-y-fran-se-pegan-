import { codigoArca, tipoComprobanteSugerido } from "@/domain/comprobante";
import {
  CONDICION_IVA_RECEPTOR,
  importesArca,
  pesos,
  tipoDocumento,
  urlQrComprobante,
  type ImportesArca,
} from "@/integrations/fiscal/arca-datos";
import type { Autorizacion, FiscalProvider, SolicitudAutorizacion, TipoFiscal } from "@/integrations/fiscal/fiscal-provider";
import { ErrorDeNegocio } from "@/services/contexto";
import { almacenTicket, credencialActiva } from "./credenciales";
import { ErrorArca, SIN_RESPUESTA } from "./soap";
import { obtenerTicket } from "./wsaa";
import { consultarComprobante, solicitarCae, ultimoAutorizado, type Cae, type DetalleComprobante } from "./wsfe";

/** Número de comprobante distinto al próximo: otra caja autorizó uno en el medio. */
const NUMERO_NO_CORRELATIVO = "10016";

/** "aaaammdd" en la hora de Argentina. */
function fechaArca(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(fecha)
    .replace(/-/g, "");
}

const deFechaArca = (f: string) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;

function validarTipo(s: SolicitudAutorizacion) {
  const esperado = tipoComprobanteSugerido(s.comercio.condicionIva, s.clienteCondicionIva);
  // En una nota de crédito alcanza con que la letra sea la del emisor (A y B son las dos de un inscripto).
  const valido = s.clase === "factura" ? s.tipo === esperado : (s.tipo === "C") === (esperado === "C");
  if (!valido) throw new ErrorDeNegocio("El tipo de comprobante no corresponde a la condición de IVA");
  if (s.clase === "nota_credito" && !s.asociado) {
    throw new ErrorDeNegocio("La nota de crédito tiene que indicar la factura que anula");
  }
}

/**
 * Autorización real con ARCA (WSFEv1), con el certificado del comercio. Corre
 * solo en el servidor: los datos del comercio y los importes los arma el
 * servidor (ver src/app/api/operaciones), nunca el navegador.
 */
export function crearArcaServidor(empresaId: string): FiscalProvider {
  return { autorizar: (s) => autorizarComprobante(empresaId, s) };
}

async function autorizarComprobante(empresaId: string, s: SolicitudAutorizacion): Promise<Autorizacion> {
  const { comercio } = s;
  validarTipo(s);

  const credencial = await credencialActiva(empresaId);
  if (!credencial) {
    throw new ErrorDeNegocio(
      "Para emitir facturas, cargá el certificado de ARCA en Configuración. Mientras tanto, emití una nota de pedido.",
    );
  }
  if (credencial.cuit !== comercio.cuit) {
    throw new ErrorDeNegocio("El certificado de ARCA es de otra CUIT: generá uno nuevo en Configuración");
  }

  let importes: ImportesArca;
  try {
    importes = importesArca(s.tipo, s.totales);
  } catch (e) {
    throw new ErrorDeNegocio(e instanceof Error ? e.message : "Importes inválidos");
  }

  const { entorno, cuit } = credencial;
  const codigo = codigoArca(s.clase, s.tipo);
  const receptor = tipoDocumento(s.clienteDocumento);
  const hoy = fechaArca(new Date());
  const ticket = await obtenerTicket(credencial, almacenTicket(empresaId));

  const detalle = (numero: number): DetalleComprobante => ({
    puntoVenta: comercio.puntoVenta,
    codigoComprobante: codigo,
    numero,
    fecha: hoy,
    documentoTipo: receptor.tipo,
    documentoNumero: receptor.numero,
    condicionIvaReceptor: CONDICION_IVA_RECEPTOR[s.clienteCondicionIva],
    importes,
    asociado: s.asociado && {
      codigoComprobante: codigoArca("factura", s.asociado.tipo as TipoFiscal),
      puntoVenta: s.asociado.puntoVenta,
      numero: s.asociado.numero,
      cuit,
      fecha: fechaArca(new Date(s.asociado.fecha)),
    },
  });

  /**
   * Si la respuesta de ARCA no llegó, el comprobante pudo quedar autorizado
   * igual. Se consulta para no perder ese CAE ni emitir otro por la misma venta.
   */
  async function recuperar(numero: number): Promise<Cae | undefined> {
    const emitido = await consultarComprobante(entorno, ticket, cuit, comercio.puntoVenta, codigo, numero).catch(
      () => undefined,
    );
    const esEste =
      emitido &&
      Number(emitido.total) === Number(pesos(importes.total)) &&
      Number(emitido.documentoNumero) === receptor.numero;
    return esEste ? emitido : undefined;
  }

  // ARCA exige numeración correlativa: se pide el último y se usa el siguiente.
  // Si otra caja ganó ese número en el medio, se reintenta una vez.
  let numero = (await ultimoAutorizado(entorno, ticket, cuit, comercio.puntoVenta, codigo)) + 1;
  let cae: Cae;
  try {
    cae = await solicitarCae(entorno, ticket, cuit, detalle(numero));
  } catch (e) {
    if (!(e instanceof ErrorArca)) throw e;
    if (e.codigos.includes(SIN_RESPUESTA)) {
      const recuperado = await recuperar(numero);
      if (!recuperado) throw e;
      cae = recuperado;
    } else if (e.codigos.includes(NUMERO_NO_CORRELATIVO)) {
      numero = (await ultimoAutorizado(entorno, ticket, cuit, comercio.puntoVenta, codigo)) + 1;
      cae = await solicitarCae(entorno, ticket, cuit, detalle(numero));
    } else {
      throw e;
    }
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
      clienteDocumento: s.clienteDocumento,
      cae: cae.cae,
    }),
    // Los CAE de homologación (pruebas) no tienen validez fiscal.
    ...(entorno === "homologacion" ? { simulado: true } : {}),
  };
}
