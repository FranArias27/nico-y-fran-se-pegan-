import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { crearDexieStore } from "@/data/indexeddb/dexie-store";
import { TRAMOS } from "@/domain/cuenta-corriente";
import { sumar } from "@/domain/dinero";
import { ventasBajoCosto } from "@/domain/reportes";
import { crearArcaSimulado } from "@/integrations/fiscal/simulated-arca";
import { crearMercadoPagoSimulado } from "@/integrations/payments/simulated-mercadopago";
import { ErrorCodigos } from "./articulos";
import { ErrorDeNegocio, type Contexto } from "./contexto";
import { crearServicios } from "./index";

const AHORA = new Date(2026, 9, 21, 16, 30); // miércoles 21/10/2026 16:30

function crearContexto(): Contexto {
  let n = 0;
  const store = crearDexieStore(`test-${Math.random()}`);
  return {
    store,
    fiscal: crearArcaSimulado({ demoraMs: 0, numerar: (clave) => store.contadores.siguiente(clave) }),
    pagos: crearMercadoPagoSimulado({ aprobarEnMs: 0 }),
    ahora: () => AHORA,
    nuevoId: () => `id-${++n}`,
  };
}

const ctx = crearContexto();
const s = crearServicios(ctx);

beforeAll(async () => {
  await s.demo.reiniciar();
});

describe("datos demo", () => {
  it("carga catálogo, clientes e historial", async () => {
    const [articulos, clientes, ventas] = await Promise.all([
      s.articulos.listar(),
      s.clientes.listar(),
      ctx.store.ventas.listar(),
    ]);
    expect(articulos.length).toBeGreaterThanOrEqual(60);
    expect(clientes).toHaveLength(26);
    expect(clientes[0].razonSocial).toBe("Consumidor final");
    expect(ventas.length).toBeGreaterThan(300);
    expect(new Set(ventas.map((v) => v.vendedorId))).toEqual(new Set(["u-admin", "u-lucia"]));
  });

  it("cada venta está pagada por completo", async () => {
    const ventas = await ctx.store.ventas.listar();
    for (const v of ventas) {
      expect(sumar(v.pagos, (p) => p.importe)).toBe(v.totales.total);
    }
  });

  it("incluye un código de caja x12 y artículos por metro y por kg", async () => {
    const articulos = await s.articulos.listar();
    expect(articulos.some((a) => a.codigosBarra.some((c) => c.cantidad === 12000))).toBe(true);
    expect(articulos.some((a) => a.unidad === "metro")).toBe(true);
    expect(articulos.some((a) => a.unidad === "kg")).toBe(true);
    expect(articulos.some((a) => a.stock < 0)).toBe(true);
    expect(articulos.some((a) => a.alicuotaIva === 1050)).toBe(true);
  });

  it("hay deuda en todos los tramos de antigüedad", async () => {
    const cartera = await s.cuentaCorriente.cartera();
    for (const tramo of TRAMOS) expect(cartera.tramos[tramo]).toBeGreaterThan(0);
    expect(cartera.cobradoMes).toBeGreaterThan(0);
  });

  it("hay ventas bajo costo y con descuento para los reportes", async () => {
    const ventas = await ctx.store.ventas.listar();
    expect(ventasBajoCosto(ventas).length).toBeGreaterThan(0);
    expect(ventas.some((v) => v.totales.descuentos > 0)).toBe(true);
    expect(ventas.some((v) => v.tipo === "A")).toBe(true);
    expect(ventas.some((v) => v.tipo === "X")).toBe(true);
  });

  it("es determinístico", async () => {
    const { generarDatosDemo } = await import("@/data/seed/generar");
    const a = generarDatosDemo(AHORA);
    const b = generarDatosDemo(AHORA);
    expect(a.ventas.length).toBe(b.ventas.length);
    expect(a.ventas.at(-1)?.totales.total).toBe(b.ventas.at(-1)?.totales.total);
  });
});

describe("registrar venta", () => {
  it("emite Factura B con CAE y descuenta stock con el código de caja", async () => {
    const articulos = await s.articulos.listar();
    const cinta = articulos.find((a) => a.codigosBarra.some((c) => c.cantidad === 12000))!;
    const venta = await s.ventas.registrar({
      tipo: "B",
      clienteId: "cf",
      items: [{ articuloId: cinta.id, cantidad: 12000 }],
      pagos: [{ medio: "efectivo", importe: 100000000 }],
      vendedorId: "u-lucia",
    });
    expect(venta.fiscal?.cae).toMatch(/^\d{14}$/);
    expect(venta.vuelto).toBe(100000000 - venta.totales.total);
    expect(venta.lineas[0].costoUnitario).toBe(cinta.costo);
    const actualizado = await s.articulos.obtener(cinta.id);
    expect(actualizado!.stock).toBe(cinta.stock - 12000);
  });

  it("no permite vender a cuenta a un cliente bloqueado", async () => {
    const articulos = await s.articulos.listar();
    await expect(
      s.ventas.registrar({
        tipo: "B",
        clienteId: "cli-12",
        items: [{ articuloId: articulos[0].id, cantidad: 1000 }],
        pagos: [{ medio: "cuenta_corriente", importe: 10_000_000 }],
        vendedorId: "u-lucia",
      }),
    ).rejects.toBeInstanceOf(ErrorDeNegocio);
  });

  it("la venta a cuenta genera la deuda con el vencimiento del cliente", async () => {
    const articulos = await s.articulos.listar();
    const art = articulos[0];
    const antes = (await s.cuentaCorriente.deCliente("cli-17"))!;
    const { lineas } = await import("@/domain/carrito").then((m) =>
      m.armarLineas("A", [{ articuloId: art.id, cantidad: 1000 }], new Map([[art.id, art]])),
    );
    const venta = await s.ventas.registrar({
      tipo: "A",
      clienteId: "cli-17",
      items: [{ articuloId: art.id, cantidad: 1000 }],
      pagos: [{ medio: "cuenta_corriente", importe: lineas[0].total }],
      vendedorId: "u-admin",
    });
    const despues = (await s.cuentaCorriente.deCliente("cli-17"))!;
    expect(despues.resumen.saldo - antes.resumen.saldo).toBe(venta.totales.total);
    const debito = despues.movimientos.find((m) => m.tipo === "venta" && m.ventaId === venta.id);
    expect(debito && "vencimiento" in debito ? debito.vencimiento : null).toBe("2026-11-20");
  });
});

describe("registrar pago", () => {
  it("imputa a la deuda más vieja y deja el excedente a favor", async () => {
    const cuenta = (await s.cuentaCorriente.deCliente("cli-07"))!;
    const deuda = cuenta.resumen.deuda;
    expect(deuda).toBeGreaterThan(0);

    const recibo = await s.cuentaCorriente.registrarPago({
      clienteId: "cli-07",
      importe: deuda + 500000,
      medio: "transferencia",
      usuarioId: "u-admin",
    });
    expect(recibo.imputaciones[0].debitoId).toBe(cuenta.resumen.deudas[0].debito.id);
    expect(recibo.saldoAFavor).toBe(500000);

    const despues = (await s.cuentaCorriente.deCliente("cli-07"))!;
    expect(despues.resumen.deuda).toBe(0);
    expect(despues.resumen.saldoAFavor).toBe(500000);
    expect(despues.resumen.saldo).toBe(-500000);
  });

  it("el saldo a favor se aplica a la siguiente venta a cuenta", async () => {
    const articulos = await s.articulos.listar();
    const art = articulos.find((a) => a.precioFinal > 500000)!;
    const venta = await s.ventas.registrar({
      tipo: "B",
      clienteId: "cli-07",
      items: [{ articuloId: art.id, cantidad: 1000 }],
      pagos: [{ medio: "cuenta_corriente", importe: art.precioFinal }],
      vendedorId: "u-admin",
    });
    const cuenta = (await s.cuentaCorriente.deCliente("cli-07"))!;
    expect(cuenta.resumen.saldoAFavor).toBe(0);
    expect(cuenta.resumen.deuda).toBe(venta.totales.total - 500000);
  });

  it("permite elegir el comprobante a imputar", async () => {
    const cuenta = (await s.cuentaCorriente.deCliente("cli-15"))!;
    const ultima = cuenta.resumen.deudas.at(-1)!;
    const recibo = await s.cuentaCorriente.registrarPago({
      clienteId: "cli-15",
      importe: ultima.pendiente,
      medio: "efectivo",
      debitoIds: [ultima.debito.id],
      usuarioId: "u-admin",
    });
    expect(recibo.imputaciones).toEqual([
      expect.objectContaining({ debitoId: ultima.debito.id, importe: ultima.pendiente }),
    ]);
  });
});

describe("artículos", () => {
  it("rechaza un código de barra que ya tiene otro artículo", async () => {
    const [a, b] = await s.articulos.listar();
    await expect(
      s.articulos.guardar({ ...b, precioNetoBase: b.precioNeto, codigosBarra: [a.codigosBarra[0]] }),
    ).rejects.toBeInstanceOf(ErrorCodigos);
  });

  it("aplica un aumento masivo por categoría manteniendo el margen", async () => {
    const antes = (await s.articulos.listar()).filter((a) => a.categoriaId === "cat-tor");
    const cambiados = await s.articulos.aplicarCambioMasivo("cat-tor", 1000);
    expect(cambiados).toBe(antes.length);
    const despues = await s.articulos.obtener(antes[0].id);
    expect(despues!.costo).toBe(Math.round(antes[0].costo * 1.1));
    expect(despues!.margen).toBe(antes[0].margen);
    expect(despues!.precioNeto).toBeGreaterThan(antes[0].precioNeto);
  });
});

describe("reportes", () => {
  it("genera el reporte del mes con comparación", async () => {
    const r = await s.reportes.generar({ periodo: "mes", rango: { desde: "2026-10-01", hasta: "2026-10-21" } });
    expect(r.resumen.cantidad).toBeGreaterThan(0);
    expect(r.resumenAnterior.cantidad).toBeGreaterThan(0);
    expect(r.rangoAnterior).toEqual({ desde: "2026-09-01", hasta: "2026-09-21" });
    expect(r.porVendedor).toHaveLength(2);
    expect(r.porDia).toHaveLength(21);
  });
});

describe("empresa nueva", () => {
  const nueva = crearServicios(crearContexto());

  it("arranca vacía, sin datos de ejemplo", async () => {
    expect(await nueva.demo.estaVacia()).toBe(true);
    await nueva.demo.inicializarEmpresa("Kiosco Mauro");
    expect(await nueva.demo.estaVacia()).toBe(false);
    const [comercio, articulos, clientes, categorias] = await Promise.all([
      nueva.demo.obtenerComercio(),
      nueva.articulos.listar(),
      nueva.clientes.listar(),
      nueva.articulos.listarCategorias(),
    ]);
    expect(comercio.razonSocial).toBe("Kiosco Mauro");
    expect(articulos).toHaveLength(0);
    expect(clientes.map((c) => c.id)).toEqual(["cf"]);
    expect(categorias).toHaveLength(1);
  });

  it("no vuelve a inicializar una empresa con datos", async () => {
    await nueva.clientes.guardar({
      razonSocial: "Cliente real",
      condicionIva: "CF",
      documento: "",
      cuentaCorriente: false,
      limiteCredito: 0,
      plazoDias: 0,
      estado: "habilitado",
    });
    await nueva.demo.inicializarEmpresa("Kiosco Mauro");
    expect(await nueva.clientes.listar()).toHaveLength(2);
  });

  it("no emite facturas sin CUIT del comercio, pero sí notas de pedido", async () => {
    const articulo = await nueva.articulos.guardar({
      codigo: "A-1",
      nombre: "Alfajor",
      marca: "",
      categoriaId: "general",
      unidad: "unidad",
      costo: 50000,
      margen: 5000,
      alicuotaIva: 2100,
      redondeo: "ninguno",
      precioNetoBase: 75000,
      stock: 10000,
      stockMinimo: 0,
      codigosBarra: [],
      activo: true,
    });
    const venta = (tipo: "B" | "X") =>
      nueva.ventas.registrar({
        tipo,
        clienteId: "cf",
        items: [{ articuloId: articulo.id, cantidad: 1000 }],
        pagos: [{ medio: "efectivo", importe: 10_000_000 }],
        vendedorId: "u-1",
      });
    await expect(venta("B")).rejects.toThrow(/CUIT/);
    await expect(venta("X")).resolves.toMatchObject({ tipo: "X" });
  });
});

describe("notas de crédito", () => {
  it("anula una venta a cuenta: devuelve el stock y cancela la deuda", async () => {
    const articulos = await s.articulos.listar();
    const art = articulos.find((a) => a.precioFinal > 100000)!;
    const { calculo } = await import("@/domain/carrito").then((m) =>
      m.armarLineas("A", [{ articuloId: art.id, cantidad: 2000 }], new Map([[art.id, art]])),
    );
    const venta = await s.ventas.registrar({
      tipo: "A",
      clienteId: "cli-17",
      items: [{ articuloId: art.id, cantidad: 2000 }],
      pagos: [{ medio: "cuenta_corriente", importe: calculo.totales.total }],
      vendedorId: "u-admin",
    });
    const stockAntes = (await s.articulos.obtener(art.id))!.stock;
    const deudaAntes = (await s.cuentaCorriente.deCliente("cli-17"))!.resumen.deuda;

    const nota = await s.ventas.emitirNotaCredito({
      ventaId: venta.id,
      devoluciones: [{ articuloId: art.id, cantidad: 2000 }],
      reintegro: "cuenta_corriente",
      reponerStock: true,
      vendedorId: "u-admin",
    });

    expect(nota).toMatchObject({ clase: "nota_credito", tipo: "A", asociado: { ventaId: venta.id } });
    expect(nota.totales.total).toBe(venta.totales.total);
    expect(nota.fiscal?.cae).toMatch(/^\d{14}$/);
    expect((await s.articulos.obtener(art.id))!.stock).toBe(stockAntes + 2000);
    expect((await s.cuentaCorriente.deCliente("cli-17"))!.resumen.deuda).toBe(deudaAntes - venta.totales.total);
    expect(await s.ventas.notasDeCredito(venta.id)).toHaveLength(1);
  });

  it("numera las notas de crédito aparte de las facturas", async () => {
    const articulos = await s.articulos.listar();
    const venta = await s.ventas.registrar({
      tipo: "B",
      clienteId: "cf",
      items: [{ articuloId: articulos[1].id, cantidad: 3000 }],
      pagos: [{ medio: "efectivo", importe: 100_000_000 }],
      vendedorId: "u-admin",
    });
    const n1 = await s.ventas.emitirNotaCredito({
      ventaId: venta.id,
      devoluciones: [{ articuloId: articulos[1].id, cantidad: 1000 }],
      reintegro: "efectivo",
      reponerStock: false,
      vendedorId: "u-admin",
    });
    const n2 = await s.ventas.emitirNotaCredito({
      ventaId: venta.id,
      devoluciones: [{ articuloId: articulos[1].id, cantidad: 1000 }],
      reintegro: "efectivo",
      reponerStock: false,
      vendedorId: "u-admin",
    });
    expect(n2.numero).toBe(n1.numero + 1);
    expect(n1.pagos).toEqual([{ medio: "efectivo", importe: n1.totales.total }]);
    await expect(
      s.ventas.emitirNotaCredito({
        ventaId: venta.id,
        devoluciones: [{ articuloId: articulos[1].id, cantidad: 2000 }],
        reintegro: "efectivo",
        reponerStock: false,
        vendedorId: "u-admin",
      }),
    ).rejects.toBeInstanceOf(ErrorDeNegocio);
  });

  it("no acredita en cuenta corriente a un cliente sin cuenta", async () => {
    const articulos = await s.articulos.listar();
    const venta = await s.ventas.registrar({
      tipo: "B",
      clienteId: "cf",
      items: [{ articuloId: articulos[2].id, cantidad: 1000 }],
      pagos: [{ medio: "efectivo", importe: 100_000_000 }],
      vendedorId: "u-admin",
    });
    await expect(
      s.ventas.emitirNotaCredito({
        ventaId: venta.id,
        devoluciones: [{ articuloId: articulos[2].id, cantidad: 1000 }],
        reintegro: "cuenta_corriente",
        reponerStock: true,
        vendedorId: "u-admin",
      }),
    ).rejects.toThrow(/cuenta corriente/);
  });

  it("los reportes restan las notas de crédito", async () => {
    const hoy = { desde: "2026-10-21", hasta: "2026-10-21" };
    const ventas = await s.ventas.listar(hoy);
    const facturado = ventas.filter((v) => v.clase !== "nota_credito").reduce((t, v) => t + v.totales.total, 0);
    const acreditado = ventas.filter((v) => v.clase === "nota_credito").reduce((t, v) => t + v.totales.total, 0);
    expect(acreditado).toBeGreaterThan(0);
    const r = await s.reportes.generar({ periodo: "rango", rango: hoy });
    expect(r.resumen.total).toBe(facturado - acreditado);
    expect(r.resumen.cantidad).toBe(ventas.filter((v) => v.clase !== "nota_credito").length);
  });
});

describe("comercio monotributista", () => {
  it("emite Factura C y rechaza A o B", async () => {
    const mono = crearServicios(crearContexto());
    await mono.demo.inicializarEmpresa("Kiosco");
    const comercio = await mono.demo.obtenerComercio();
    await mono.demo.guardarComercio({ ...comercio, condicionIva: "MONOTRIBUTO", cuit: "20123456786" });
    const art = await mono.articulos.guardar({
      codigo: "G-1",
      nombre: "Gaseosa",
      marca: "",
      categoriaId: "general",
      unidad: "unidad",
      costo: 100000,
      margen: 5000,
      alicuotaIva: 2100,
      redondeo: "ninguno",
      precioNetoBase: 150000,
      stock: 5000,
      stockMinimo: 0,
      codigosBarra: [],
      activo: true,
    });
    const vender = (tipo: "B" | "C") =>
      mono.ventas.registrar({
        tipo,
        clienteId: "cf",
        items: [{ articuloId: art.id, cantidad: 1000 }],
        pagos: [{ medio: "efectivo", importe: art.precioFinal }],
        vendedorId: "u-1",
      });
    await expect(vender("B")).rejects.toBeInstanceOf(ErrorDeNegocio);
    const venta = await vender("C");
    expect(venta.totales).toMatchObject({ total: art.precioFinal, iva: 0, ivaPorAlicuota: [] });
    expect(venta.numero).toBe(1);
    expect(venta.fiscal?.simulado).toBe(true);
  });
});
