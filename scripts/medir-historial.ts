import { randomUUID } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";
import { proyectarCartera } from "../src/domain/proyeccion-cartera";
import { leerCartera } from "../src/server/cartera";
import type { Movimiento } from "../src/domain/types";

async function main() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
    throw new Error("Iniciá el emulador local y definí FIRESTORE_EMULATOR_HOST. Este script nunca usa producción.");
  const db = new Firestore({ projectId: "demo-el-tornillo", host, ssl: false });
  const empresa = `carga-${randomUUID()}`;
  const base = db.doc(`empresas/${empresa}`);
  try {
    const writer = db.bulkWriter();
    const escrituras: Promise<unknown>[] = [];
    escrituras.push(writer.set(base, { nombre: "Carga sintética", activa: true, demo: true }));
    for (let c = 0; c < 50; c++) {
      const clienteId = `cliente-${c}`;
      escrituras.push(
        writer.set(base.collection("clientes").doc(clienteId), {
          id: clienteId,
          razonSocial: clienteId,
          condicionIva: "CF",
          documento: "",
          cuentaCorriente: true,
          limiteCredito: 1000000,
          plazoDias: 7,
          estado: "habilitado",
          creadoEn: "2026-01-01T12:00:00Z",
        }),
      );
      const movimientos: Movimiento[] = [];
      for (let n = 0; n < 100; n++) {
        const venta: Movimiento = {
          id: `${c}-v-${n}`,
          clienteId,
          tipo: "venta",
          importe: 10000,
          fecha: "2026-10-01T12:00:00Z",
          vencimiento: "2026-10-08",
          descripcion: "Venta sintética",
        };
        const pago: Movimiento = {
          id: `${c}-p-${n}`,
          clienteId,
          tipo: "pago",
          importe: 10000,
          fecha: "2026-10-02T12:00:00Z",
          descripcion: "Pago sintético",
          imputaciones: [{ debitoId: venta.id, importe: 10000 }],
        };
        movimientos.push(venta, pago);
      }
      for (const m of movimientos) escrituras.push(writer.set(base.collection("movimientos").doc(m.id), m));
      escrituras.push(writer.set(base.collection("carteraResumen").doc(clienteId), proyectarCartera(movimientos)));
    }
    await writer.close();
    await Promise.all(escrituras);
    const t0 = performance.now();
    const historial = await base.collection("movimientos").get();
    const msHistorial = performance.now() - t0;
    const bytesHistorial = Buffer.byteLength(JSON.stringify(historial.docs.map((d) => d.data())));
    const t1 = performance.now();
    const cartera = await leerCartera(db, empresa);
    const msCartera = performance.now() - t1;
    console.log(
      JSON.stringify(
        {
          escenario: "Emulador local; 50 clientes, 10.000 movimientos cancelados",
          historial: { documentos: historial.size, bytesRespuesta: bytesHistorial, ms: Math.round(msHistorial) },
          cartera: {
            documentosLeidos: 100,
            bytesRespuesta: Buffer.byteLength(JSON.stringify(cartera)),
            ms: Math.round(msCartera),
          },
          nota: "Lecturas lógicas del escenario, no una factura de Firebase ni latencia de producción. Clientes sin resumen requieren migración.",
        },
        null,
        2,
      ),
    );
  } finally {
    await db.recursiveDelete(base);
    await db.terminate();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
