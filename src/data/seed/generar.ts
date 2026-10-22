import { armarLineas } from "@/domain/carrito";
import { calcularCobro, pagosNetosDeVuelto } from "@/domain/cobro";
import { digitoVerificadorCuit, digitoVerificadorEan13 } from "@/domain/identificadores";
import { aFechaISO, sumarDias } from "@/domain/fechas";
import { recalcularDesdeCosto } from "@/domain/precios";
import type {
  Articulo,
  Cliente,
  Comercio,
  Descuento,
  ItemCarrito,
  MedioPago,
  Movimiento,
  MovimientoCredito,
  MovimientoDebito,
  Pago,
  Recibo,
  TipoComprobante,
  Venta,
} from "@/domain/types";
import { CLIENTE_CONSUMIDOR_FINAL_ID, UNIDAD } from "@/domain/types";
import { codigoArca } from "@/domain/comprobante";
import { urlQrComprobante } from "@/integrations/fiscal/arca-datos";
import { caeFicticio } from "@/integrations/fiscal/simulated-arca";
import { formatNumeroComprobante } from "@/lib/format";
import { descripcionComprobante } from "@/services/ventas";
import type { DatosIniciales } from "../store";
import { ARTICULOS, CATEGORIAS } from "./catalogo";
import { CLIENTES, type ClienteSemilla } from "./clientes";
import { crearAzar, type Azar } from "./prng";

const DIAS_HISTORIAL = 90;
const PUNTO_VENTA = 1;
/** Inflación mensual de referencia: los precios del historial son más bajos que los actuales. */
const INFLACION_MENSUAL = 0.022;

const VENDEDORES = [
  { id: "u-lucia", peso: 60 },
  { id: "u-admin", peso: 40 },
] as const;

function cuit(azar: Azar, prefijo: string): string {
  for (;;) {
    const base = prefijo + azar.digitos(8);
    const dv = digitoVerificadorCuit(base);
    if (dv !== null) return base + dv;
  }
}

function ean(azar: Azar): string {
  const base = "779" + azar.digitos(9);
  return base + digitoVerificadorEan13(base);
}

export const COMERCIO_DEMO: Comercio = {
  razonSocial: "El Tornillo S.R.L.",
  nombreFantasia: "Ferretería El Tornillo",
  cuit: "30715834924",
  condicionIva: "RI",
  ingresosBrutos: "901-715834-4",
  inicioActividades: "2012-03-01",
  domicilio: "Av. Hipólito Yrigoyen 4520",
  localidad: "Lanús Oeste, Buenos Aires",
  telefono: "11 0000-4520",
  email: "ventas@eltornillo.ejemplo",
  puntoVenta: PUNTO_VENTA,
};

function generarArticulos(azar: Azar, ahora: string): Articulo[] {
  const usados = new Set<string>();
  const codigoUnico = () => {
    let c = ean(azar);
    while (usados.has(c)) c = ean(azar);
    usados.add(c);
    return c;
  };

  return ARTICULOS.map((s) => {
    const base = {
      costo: Math.round(s.costo * 100),
      margen: Math.round(s.margen * 100),
      alicuotaIva: s.iva ?? 2100,
      redondeo: s.redondeo ?? "ninguno",
    } as const;
    return {
      id: `art-${s.codigo.toLowerCase()}`,
      codigo: s.codigo,
      nombre: s.nombre,
      marca: s.marca,
      categoriaId: s.categoriaId,
      unidad: s.unidad ?? "unidad",
      ...base,
      ...recalcularDesdeCosto(base),
      stock: Math.round(s.stock * 1000),
      stockMinimo: Math.round(s.minimo * 1000),
      codigosBarra: [
        { codigo: codigoUnico(), cantidad: UNIDAD },
        ...(s.codigosExtra ?? []).map((n) => ({ codigo: codigoUnico(), cantidad: n * UNIDAD })),
      ],
      activo: true,
      actualizadoEn: ahora,
    };
  });
}

function generarClientes(azar: Azar, ahora: string): Cliente[] {
  const cf: Cliente = {
    id: CLIENTE_CONSUMIDOR_FINAL_ID,
    razonSocial: "Consumidor final",
    condicionIva: "CF",
    documento: "",
    cuentaCorriente: false,
    limiteCredito: 0,
    plazoDias: 0,
    estado: "habilitado",
    creadoEn: ahora,
  };
  const resto = CLIENTES.map((s, i): Cliente => {
    const documento = s.tipoDoc === "dni" ? azar.entero(20_000_000, 42_000_000).toString() : cuit(azar, s.tipoDoc);
    const esEmpresa = s.tipoDoc === "30" || s.tipoDoc === "33";
    return {
      id: s.id,
      razonSocial: s.razonSocial,
      nombreFantasia: s.nombreFantasia,
      condicionIva: s.condicionIva,
      documento,
      domicilio: s.domicilio,
      // Teléfonos ficticios (no corresponden a nadie).
      telefono: `11 0000-${(1001 + i * 37).toString().padStart(4, "0")}`,
      email: esEmpresa ? `administracion${i + 1}@cliente.ejemplo` : undefined,
      cuentaCorriente: Boolean(s.cuentaCorriente),
      limiteCredito: Math.round((s.cuentaCorriente?.limite ?? 0) * 100),
      plazoDias: s.cuentaCorriente?.plazo ?? 0,
      estado: s.estado ?? "habilitado",
      notas: s.notas,
      creadoEn: ahora,
    };
  });
  return [cf, ...resto];
}

/** Hora del día (en minutos) de una venta: mañana 8–13 y tarde 15:30–19:30. */
function minutoDelDia(azar: Azar, sabado: boolean): number {
  if (sabado || azar.probabilidad(0.55)) return azar.entero(8 * 60, 13 * 60);
  return azar.entero(15 * 60 + 30, 19 * 60 + 30);
}

function cantidadPara(azar: Azar, art: Articulo, mayorista: boolean): number {
  if (art.unidad === "metro") return azar.elegir([2, 3, 5, 5, 10, 10, 15, 20, 25, 50]) * UNIDAD;
  if (art.unidad === "kg") return azar.elegir([0.5, 1, 1, 1.5, 2, 3, 5]) * UNIDAD;
  const barato = art.precioFinal < 300000;
  let n = barato ? azar.entero(1, 6) : azar.ponderado([1, 2, 3], (x) => (x === 1 ? 8 : x === 2 ? 3 : 1));
  if (mayorista) n *= azar.entero(1, 4);
  if (art.categoriaId === "cat-con" && mayorista) n = azar.entero(4, 20);
  return n * UNIDAD;
}

function medioContado(azar: Azar): Exclude<MedioPago, "cuenta_corriente"> {
  return azar.ponderado(
    [
      { m: "efectivo", p: 40 },
      { m: "transferencia", p: 22 },
      { m: "debito", p: 15 },
      { m: "credito", p: 8 },
      { m: "qr", p: 15 },
    ] as const,
    (x) => x.p,
  ).m;
}

/** Efectivo entregado por el cliente: redondeado hacia arriba, para que haya vuelto. */
function efectivoEntregado(azar: Azar, total: number): number {
  const paso = azar.elegir([100000, 200000, 1000000]);
  return azar.probabilidad(0.4) ? total : Math.ceil(total / paso) * paso;
}

export function generarDatosDemo(ahoraDate: Date): DatosIniciales {
  const azar = crearAzar(20261021);
  const ahora = ahoraDate.toISOString();
  const hoy = aFechaISO(ahoraDate);
  const minutoActual = ahoraDate.getHours() * 60 + ahoraDate.getMinutes();

  const articulos = generarArticulos(azar, ahora);
  const clientes = generarClientes(azar, ahora);
  const semillaDe = new Map(CLIENTES.map((c) => [c.id, c]));
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  const contadores: Record<string, number> = {};
  const siguiente = (clave: string) => (contadores[clave] = (contadores[clave] ?? 0) + 1);

  const ventas: Venta[] = [];
  const movimientos: Movimiento[] = [];
  const recibos: Recibo[] = [];
  const pendiente = new Map<string, number>(); // debitoId → saldo pendiente
  const debitosPorCliente = new Map<string, MovimientoDebito[]>();
  let secuenciaId = 0;
  const id = (prefijo: string) => `${prefijo}-${(++secuenciaId).toString().padStart(6, "0")}`;

  const instante = (fecha: string, minuto: number) => {
    const [a, m, d] = fecha.split("-").map(Number);
    return new Date(a, m - 1, d, Math.floor(minuto / 60), minuto % 60, azar.entero(0, 59)).toISOString();
  };

  function imputarFIFO(clienteId: string, importe: number) {
    const imputaciones: { debitoId: string; importe: number }[] = [];
    let restante = importe;
    for (const deb of debitosPorCliente.get(clienteId) ?? []) {
      if (restante <= 0) break;
      const saldo = pendiente.get(deb.id) ?? 0;
      if (saldo <= 0) continue;
      const aplicado = Math.min(saldo, restante);
      imputaciones.push({ debitoId: deb.id, importe: aplicado });
      pendiente.set(deb.id, saldo - aplicado);
      restante -= aplicado;
    }
    return { imputaciones, sobrante: restante };
  }

  function registrarPago(clienteId: string, fecha: string, importe: number, medio: MedioPago) {
    const cliente = clientePorId.get(clienteId)!;
    const { imputaciones, sobrante } = imputarFIFO(clienteId, importe);
    const numero = siguiente(`R-${PUNTO_VENTA}`);
    const descripciones = new Map(
      (debitosPorCliente.get(clienteId) ?? []).map((d) => [d.id, d.descripcion]),
    );
    const recibo: Recibo = {
      id: id("rec"),
      numero,
      puntoVenta: PUNTO_VENTA,
      fecha,
      clienteId,
      clienteNombre: cliente.razonSocial,
      importe,
      medio,
      imputaciones: imputaciones.map((i) => ({ ...i, descripcion: descripciones.get(i.debitoId) ?? "" })),
      saldoAFavor: sobrante,
      usuarioId: azar.probabilidad(0.6) ? "u-admin" : "u-lucia",
    };
    recibos.push(recibo);
    const mov: MovimientoCredito = {
      id: id("mov"),
      tipo: "pago",
      clienteId,
      fecha,
      importe,
      descripcion: `Recibo ${formatNumeroComprobante(PUNTO_VENTA, numero)}`,
      reciboId: recibo.id,
      medio,
      imputaciones,
    };
    movimientos.push(mov);
  }

  function generarVenta(fecha: string, minuto: number, diasAtras: number) {
    const anonimo = azar.probabilidad(0.55);
    const semilla: ClienteSemilla | undefined = anonimo
      ? undefined
      : azar.ponderado(CLIENTES, (c) => c.frecuencia);
    const cliente = clientePorId.get(semilla?.id ?? CLIENTE_CONSUMIDOR_FINAL_ID)!;
    const mayorista = cliente.condicionIva === "RI" || cliente.condicionIva === "MONOTRIBUTO";
    const vendedorId = azar.ponderado(VENDEDORES, (v) => v.peso).id;
    const esAdmin = vendedorId === "u-admin";

    // Artículos
    const cantidadLineas =
      azar.ponderado([1, 2, 3, 4, 5], (n) => [35, 30, 20, 10, 5][n - 1]) + (mayorista ? azar.entero(0, 2) : 0);
    const elegidos = new Set<Articulo>();
    while (elegidos.size < cantidadLineas) elegidos.add(azar.ponderado(articulos, (a) => rotacionDe(a)));

    // Precios del momento: más bajos cuanto más atrás en el tiempo.
    const factor = Math.pow(1 + INFLACION_MENSUAL, -diasAtras / 30);
    const historicos = new Map<string, Articulo>();
    const items: ItemCarrito[] = [];
    for (const art of elegidos) {
      historicos.set(art.id, {
        ...art,
        costo: Math.round(art.costo * factor),
        precioNeto: Math.round(art.precioNeto * factor),
        precioFinal: Math.round(art.precioFinal * factor),
      });
      let descuento: Descuento | undefined;
      if (esAdmin && azar.probabilidad(0.06)) {
        descuento = { tipo: "porcentaje", valor: azar.elegir([500, 1000, 1500]) };
      }
      // Liquidación de artículos de bajo margen: algunas ventas quedan bajo costo.
      if (esAdmin && art.margen <= 2500 && azar.probabilidad(0.25)) {
        descuento = { tipo: "porcentaje", valor: azar.elegir([2500, 3000]) };
      }
      items.push({ articuloId: art.id, cantidad: cantidadPara(azar, art, mayorista), descuento });
    }
    const descuentoTotal: Descuento | undefined =
      esAdmin && mayorista && azar.probabilidad(0.08) ? { tipo: "porcentaje", valor: azar.elegir([500, 1000]) } : undefined;

    // Comprobante
    const tipo: TipoComprobante =
      cliente.condicionIva === "RI"
        ? azar.probabilidad(0.9)
          ? "A"
          : "X"
        : azar.probabilidad(cliente.id === CLIENTE_CONSUMIDOR_FINAL_ID ? 0.8 : 0.7)
          ? "B"
          : "X";

    const { lineas, calculo } = armarLineas(tipo, items, historicos, descuentoTotal);
    const total = calculo.totales.total;

    // Pago
    const perfil = semilla?.cuentaCorriente?.perfil;
    const puedeACuenta =
      cliente.cuentaCorriente && !(cliente.estado === "bloqueado" && diasAtras < (perfil?.dejaDePagarHace ?? 0) - 25);
    let pagos: Pago[];
    if (puedeACuenta && azar.probabilidad(0.75)) {
      if (azar.probabilidad(0.12)) {
        const entrega = Math.round((total * azar.elegir([0.3, 0.5])) / 10000) * 10000;
        pagos = [
          { medio: "efectivo", importe: entrega },
          { medio: "cuenta_corriente", importe: total - entrega },
        ];
      } else {
        pagos = [{ medio: "cuenta_corriente", importe: total }];
      }
    } else {
      const medio = medioContado(azar);
      pagos = [{ medio, importe: medio === "efectivo" ? efectivoEntregado(azar, total) : total }];
    }
    const cobro = calcularCobro(total, pagos);

    const fechaHora = instante(fecha, minuto);
    const numero = siguiente(`${tipo}-${PUNTO_VENTA}`);
    const venta: Venta = {
      id: id("vta"),
      tipo,
      puntoVenta: PUNTO_VENTA,
      numero,
      fecha: fechaHora,
      clienteId: cliente.id,
      clienteNombre: cliente.razonSocial,
      clienteCondicionIva: cliente.condicionIva,
      clienteDocumento: cliente.documento,
      vendedorId,
      lineas,
      descuentoTotal,
      totales: calculo.totales,
      pagos: pagosNetosDeVuelto(pagos, cobro.vuelto),
      vuelto: cobro.vuelto,
    };
    if (tipo !== "X") {
      const cae = caeFicticio({ tipo, puntoVenta: PUNTO_VENTA, numero, fecha: fechaHora });
      const qrUrl = urlQrComprobante({
        fecha: fechaHora,
        cuit: COMERCIO_DEMO.cuit,
        puntoVenta: PUNTO_VENTA,
        codigoComprobante: codigoArca("factura", tipo),
        numero,
        total,
        clienteDocumento: cliente.documento,
        cae,
      });
      venta.fiscal = { cae, caeVencimiento: sumarDias(fecha, 10), qrUrl, simulado: true };
    }
    ventas.push(venta);

    if (cobro.aCuenta > 0) {
      const debito: MovimientoDebito = {
        id: id("mov"),
        tipo: "venta",
        clienteId: cliente.id,
        fecha: fechaHora,
        importe: cobro.aCuenta,
        descripcion: descripcionComprobante(venta),
        ventaId: venta.id,
        vencimiento: sumarDias(fecha, cliente.plazoDias),
      };
      movimientos.push(debito);
      pendiente.set(debito.id, debito.importe);
      const lista = debitosPorCliente.get(cliente.id);
      if (lista) lista.push(debito);
      else debitosPorCliente.set(cliente.id, [debito]);
    }
  }

  const rotacion = new Map(ARTICULOS.map((s) => [`art-${s.codigo.toLowerCase()}`, s.rotacion]));
  const rotacionDe = (a: Articulo) => rotacion.get(a.id) ?? 1;

  // Día de pago semanal de cada cliente con cuenta corriente (lunes a viernes).
  const diaDePago = new Map(CLIENTES.map((c, i) => [c.id, (i % 5) + 1]));
  const notaDeCreditoHace = 18;

  for (let diasAtras = DIAS_HISTORIAL - 1; diasAtras >= 0; diasAtras--) {
    const fecha = sumarDias(hoy, -diasAtras);
    const [a, m, d] = fecha.split("-").map(Number);
    const diaSemana = new Date(a, m - 1, d).getDay();
    if (diaSemana === 0) continue; // domingo cerrado

    const sabado = diaSemana === 6;
    const inicioDelDia = new Date(a, m - 1, d).toISOString();
    const crecimiento = 1 + 0.15 * (1 - diasAtras / DIAS_HISTORIAL);
    const cantidad = Math.round((sabado ? azar.entero(8, 14) : azar.entero(16, 30)) * crecimiento);

    const minutos = Array.from({ length: cantidad }, () => minutoDelDia(azar, sabado))
      .filter((min) => diasAtras > 0 || min <= minutoActual)
      .sort((x, y) => x - y);
    for (const minuto of minutos) generarVenta(fecha, minuto, diasAtras);

    // Pagos de cuenta corriente del día.
    for (const [clienteId, semilla] of semillaDe) {
      const perfil = semilla.cuentaCorriente?.perfil;
      if (!perfil || diaDePago.get(clienteId) !== diaSemana) continue;
      if (perfil.dejaDePagarHace !== undefined && diasAtras < perfil.dejaDePagarHace) continue;
      if (diasAtras === 0 && minutoActual < 11 * 60) continue;

      const limite = sumarDias(fecha, -perfil.atraso);
      const aPagar = (debitosPorCliente.get(clienteId) ?? [])
        .filter((deb) => deb.vencimiento <= limite && deb.fecha < inicioDelDia)
        .reduce((s, deb) => s + (pendiente.get(deb.id) ?? 0), 0);
      const importe = perfil.parcial ? Math.round((aPagar * perfil.parcial) / 10000) * 10000 : aPagar;
      if (importe <= 0) continue;
      const medio = azar.ponderado(
        [
          { m: "transferencia", p: 60 },
          { m: "efectivo", p: 30 },
          { m: "qr", p: 10 },
        ] as const,
        (x) => x.p,
      ).m;
      registrarPago(clienteId, instante(fecha, azar.entero(10 * 60, 18 * 60)), importe, medio);
    }

    // Una nota de crédito por devolución, para que aparezca en la cuenta corriente.
    if (diasAtras === notaDeCreditoHace) {
      const clienteId = "cli-15";
      const importe = 4850000;
      const { imputaciones } = imputarFIFO(clienteId, importe);
      const numero = siguiente(`NCA-${PUNTO_VENTA}`);
      movimientos.push({
        id: id("mov"),
        tipo: "nota_credito",
        clienteId,
        fecha: instante(fecha, 11 * 60),
        importe,
        descripcion: `Nota de crédito A ${formatNumeroComprobante(PUNTO_VENTA, numero)} (devolución de mercadería)`,
        imputaciones,
      });
    }
  }

  return {
    comercio: COMERCIO_DEMO,
    categorias: CATEGORIAS,
    articulos,
    clientes,
    ventas,
    movimientos,
    recibos,
    contadores,
  };
}
