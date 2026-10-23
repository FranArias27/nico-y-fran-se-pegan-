import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ejecutarOperacion } from "./operaciones/ejecutar";
import { ejecutarGestion } from "./gestion";
import { conExclusion } from "./exclusion";
import { respaldarEmpresa, restaurarEmpresa } from "./respaldo";
import { generarExcel, leerExcel, importarExcel } from "./excel";
import type { Pedido } from "./operaciones/pedido";
import type { Movimiento, Venta } from "@/domain/types";
import { creditoSinImputar, esCredito } from "@/domain/cuenta-corriente";

const estado = vi.hoisted(() => ({ db: undefined as unknown as Firestore }));
vi.mock("./firebase-admin", () => ({
  adminDb: () => estado.db,
  adminAuth: () => ({}),
  ErrorConfiguracion: class extends Error {},
}));

const ejecutar = describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST);
ejecutar("Firestore: concurrencia, recuperación, caja, compras y reglas", () => {
  let empresa: string, uid: string, rules: RulesTestEnvironment;
  const empresas: string[] = [],
    usuarios: string[] = [];
  const base = () => estado.db.doc(`empresas/${empresa}`);
  const id = () => randomUUID();
  const venta = (
    cantidad = 1000,
    medio: "transferencia" | "cuenta_corriente" | "efectivo" = "transferencia",
  ): Pedido => ({
    empresaId: empresa,
    id: id(),
    accion: "venta",
    datos: {
      tipo: "X",
      clienteId: "cliente",
      items: [{ articuloId: "art", cantidad }],
      pagos: [{ medio, importe: Math.round((10000 * cantidad) / 1000) }],
    },
  });
  async function paralelo(pedidos: Pedido[]) {
    const resultados = await Promise.allSettled(pedidos.map((p) => ejecutarOperacion(uid, p)));
    return Promise.allSettled(
      resultados.map((r, i) =>
        r.status === "fulfilled" ? Promise.resolve(r.value) : ejecutarOperacion(uid, pedidos[i]),
      ),
    );
  }
  beforeAll(async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST!;
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Los tests solo admiten un emulador local");
    estado.db = new Firestore({ projectId: "demo-el-tornillo", host, ssl: false, ignoreUndefinedProperties: true });
    const [hostname, port] = host.split(":");
    rules = await initializeTestEnvironment({
      projectId: "demo-el-tornillo",
      firestore: { host: hostname, port: Number(port), rules: await readFile("firestore.rules", "utf8") },
    });
  });
  beforeEach(async () => {
    empresa = `test-${id()}`;
    uid = `u-${id()}`;
    empresas.push(empresa);
    usuarios.push(uid);
    const b = estado.db.batch();
    b.set(base(), { nombre: "Prueba", activa: true, demo: true });
    b.set(estado.db.doc(`usuarios/${uid}`), { nombre: "Admin", empresaId: empresa, activo: true, rol: "admin" });
    b.set(base().collection("config").doc("comercio"), {
      razonSocial: "Prueba",
      nombreFantasia: "Prueba",
      cuit: "30715834924",
      condicionIva: "RI",
      puntoVenta: 1,
      ingresosBrutos: "",
      inicioActividades: "2026-01-01",
      domicilio: "",
      localidad: "",
      telefono: "",
      email: "",
    });
    b.set(base().collection("categorias").doc("general"), { id: "general", nombre: "General" });
    b.set(base().collection("articulos").doc("art"), {
      id: "art",
      codigo: "ART",
      nombre: "Artículo",
      marca: "",
      categoriaId: "general",
      unidad: "unidad",
      alicuotaIva: 2100,
      redondeo: "ninguno",
      precioNeto: 10000,
      precioFinal: 12100,
      stock: 100000,
      stockMinimo: 0,
      codigosBarra: [{ codigo: "123", cantidad: 12000 }],
      activo: true,
      actualizadoEn: new Date().toISOString(),
    });
    b.set(base().collection("costos").doc("art"), { costo: 5000, margen: 10000 });
    b.set(base().collection("clientes").doc("cliente"), {
      id: "cliente",
      razonSocial: "Cliente",
      condicionIva: "CF",
      documento: "",
      cuentaCorriente: true,
      limiteCredito: 100000000,
      plazoDias: 7,
      estado: "habilitado",
      creadoEn: new Date().toISOString(),
    });
    await b.commit();
  });
  afterAll(async () => {
    for (const e of empresas) await estado.db.recursiveDelete(estado.db.doc(`empresas/${e}`));
    for (const u of usuarios) await estado.db.doc(`usuarios/${u}`).delete();
    await rules?.cleanup();
    await estado.db?.terminate();
  });
  it("dos cobranzas no imputan más que la deuda y reintentar no duplica recibos", async () => {
    await ejecutarOperacion(uid, venta(1000, "cuenta_corriente"));
    const pedidos: Pedido[] = [0, 1].map(() => ({
      empresaId: empresa,
      id: id(),
      accion: "pago",
      datos: { clienteId: "cliente", importe: 8000, medio: "transferencia" },
    }));
    expect((await paralelo(pedidos)).every((r) => r.status === "fulfilled")).toBe(true);
    await ejecutarOperacion(uid, pedidos[0]);
    const movimientos = (await base().collection("movimientos").get()).docs.map((d) => d.data() as Movimiento);
    const creditos = movimientos.filter(esCredito);
    expect(creditos.flatMap((c) => c.imputaciones).reduce((s, i) => s + i.importe, 0)).toBe(10000);
    expect(creditos.reduce((s, c) => s + creditoSinImputar(c), 0)).toBe(6000);
    expect((await base().collection("recibos").get()).size).toBe(2);
  }, 30000);
  it("dos devoluciones simultáneas no superan lo vendido", async () => {
    const original = (await ejecutarOperacion(uid, venta())) as Venta;
    const notas: Pedido[] = [0, 1].map(() => ({
      empresaId: empresa,
      id: id(),
      accion: "nota_credito",
      datos: {
        ventaId: original.id,
        devoluciones: [{ articuloId: "art", cantidad: 1000 }],
        reintegro: "transferencia",
        reponerStock: true,
      },
    }));
    const resultados = await paralelo(notas);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await base().collection("articulos").doc("art").get()).data()?.stock).toBe(100000);
    expect((await base().collection("ventas").where("clase", "==", "nota_credito").get()).size).toBe(1);
  }, 30000);
  it("dos ventas simultáneas consumen el saldo a favor sin duplicarlo ni perder imputaciones", async () => {
    await ejecutarOperacion(uid, {
      empresaId: empresa,
      id: id(),
      accion: "pago",
      datos: { clienteId: "cliente", importe: 20000, medio: "transferencia" },
    });
    expect(
      (await paralelo([venta(1000, "cuenta_corriente"), venta(1000, "cuenta_corriente")])).every(
        (r) => r.status === "fulfilled",
      ),
    ).toBe(true);
    const movimientos = (await base().collection("movimientos").get()).docs.map((d) => d.data() as Movimiento);
    const credito = movimientos.find(esCredito)!;
    expect(credito.imputaciones).toHaveLength(2);
    expect(creditoSinImputar(credito)).toBe(0);
  }, 30000);
  it("preserva un trabajo incierto y rechaza cambios del pedido", async () => {
    const op = id();
    await expect(
      conExclusion(estado.db, empresa, op, uid, { total: 100 }, async (e) => {
        e.proteger();
        await e.guardar({ protegida: true });
        throw new Error("corte");
      }),
    ).rejects.toThrow("corte");
    await expect(conExclusion(estado.db, empresa, id(), uid, {}, async () => 1)).rejects.toThrow("operación en curso");
    await expect(conExclusion(estado.db, empresa, op, uid, { total: 200 }, async () => 1)).rejects.toThrow(
      "otro pedido",
    );
    expect(await conExclusion(estado.db, empresa, op, uid, { total: 100 }, async () => 7)).toBe(7);
  });
  it("abre caja, contabiliza efectivo una sola vez y guarda el arqueo", async () => {
    await ejecutarGestion(estado.db, empresa, uid, id(), { accion: "abrir_caja", importe: 1000 });
    const pedido = venta(1000, "efectivo");
    await ejecutarOperacion(uid, pedido);
    await ejecutarOperacion(uid, pedido);
    expect((await base().collection("caja").doc("actual").get()).data()?.esperado).toBe(11000);
    await ejecutarGestion(estado.db, empresa, uid, id(), { accion: "cerrar_caja", importe: 10500 });
    expect((await base().collection("caja").doc("actual").get()).data()?.diferencia).toBe(-500);
    await expect(ejecutarOperacion(uid, venta(1000, "efectivo"))).rejects.toThrow("Abrí la caja");
  });
  it("recibe mercadería, conserva margen y limita pagos al saldo del proveedor", async () => {
    await ejecutarGestion(estado.db, empresa, uid, id(), {
      accion: "proveedor",
      proveedor: { id: "p", nombre: "Proveedor", documento: "", telefono: "" },
    });
    const compra = id();
    await ejecutarGestion(estado.db, empresa, uid, compra, {
      accion: "compra",
      proveedorId: "p",
      comprobante: "001",
      lineas: [{ articuloId: "art", cantidad: 2000, costo: 6000 }],
      pagado: 0,
      medio: "transferencia",
    });
    expect((await base().collection("articulos").doc("art").get()).data()).toMatchObject({
      stock: 102000,
      precioNeto: 12000,
    });
    await ejecutarGestion(estado.db, empresa, uid, id(), {
      accion: "pago_proveedor",
      compraId: compra,
      importe: 10000,
      medio: "transferencia",
    });
    expect((await base().collection("proveedores").doc("p").get()).data()?.saldo).toBe(4520);
    await expect(
      ejecutarGestion(estado.db, empresa, uid, id(), {
        accion: "pago_proveedor",
        compraId: compra,
        importe: 5000,
        medio: "transferencia",
      }),
    ).rejects.toThrow("saldo pendiente");
  });
  it("rechaza un inventario basado en stock anterior a una venta", async () => {
    await ejecutarOperacion(uid, venta());
    await expect(
      ejecutarGestion(estado.db, empresa, uid, id(), {
        accion: "inventario",
        articuloId: "art",
        esperado: 100000,
        contado: 90000,
        motivo: "Conteo",
      }),
    ).rejects.toThrow("stock cambió");
  });
  it("respalda y restaura verificando contenido sin sobrescribir el original", async () => {
    await ejecutarOperacion(uid, venta());
    const respaldo = await respaldarEmpresa(estado.db, empresa);
    const destino = `test-${id()}`;
    empresas.push(destino);
    await estado.db.doc(`empresas/${destino}`).set({ nombre: "Recuperada", activa: false, demo: true });
    expect((await restaurarEmpresa(estado.db, destino, JSON.parse(JSON.stringify(respaldo)))).documentos).toBe(
      respaldo.documentos.length,
    );
    expect((await estado.db.doc(`empresas/${destino}`).get()).data()).toMatchObject({
      activa: false,
      restaurando: false,
    });
    expect((await estado.db.collection(`empresas/${destino}/ventas`).get()).size).toBe(1);
    await expect(restaurarEmpresa(estado.db, destino, respaldo)).rejects.toThrow("ya terminó");
    await expect(restaurarEmpresa(estado.db, empresa, respaldo)).rejects.toThrow("empresa nueva");
  }, 30000);
  it("exporta y reimporta Excel preservando stock y código de caja x12", async () => {
    const buffer = await generarExcel(estado.db, empresa, false);
    const filas = await leerExcel(Uint8Array.from(buffer).buffer);
    await importarExcel(estado.db, empresa, uid, id(), filas);
    expect((await base().collection("articulos").doc("art").get()).data()).toMatchObject({
      stock: 100000,
      codigosBarra: [{ codigo: "123", cantidad: 12000 }],
    });
  }, 30000);
  it("las reglas aíslan empresas, costos, stock y datos en recuperación", async () => {
    const admin = rules.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(admin, `empresas/${empresa}/costos/art`)));
    const vendedor = `u-${id()}`;
    usuarios.push(vendedor);
    await estado.db
      .doc(`usuarios/${vendedor}`)
      .set({ nombre: "Vendedor", rol: "vendedor", activo: true, empresaId: empresa });
    const cliente = rules.authenticatedContext(vendedor).firestore();
    await assertFails(getDoc(doc(cliente, `empresas/${empresa}/costos/art`)));
    await assertFails(setDoc(doc(cliente, `empresas/${empresa}/movimientos/falso`), { importe: 100 }));
    await assertFails(getDoc(doc(cliente, "empresas/otra/articulos/art")));
    await assertFails(
      setDoc(doc(admin, `empresas/${empresa}/articulos/art`), {
        ...(await base().collection("articulos").doc("art").get()).data(),
        stock: 0,
      }),
    );
    await base().update({ restaurando: true });
    await assertFails(getDoc(doc(admin, `empresas/${empresa}/articulos/art`)));
  }, 30000);
});
