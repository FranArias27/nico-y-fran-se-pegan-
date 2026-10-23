import type { Firestore } from "firebase-admin/firestore";
import { proyectarCartera, type ProyeccionCartera } from "@/domain/proyeccion-cartera";
import { resumirCuenta, tramosVacios, TRAMOS } from "@/domain/cuenta-corriente";
import type { Cliente, Movimiento } from "@/domain/types";
import type { ResumenCartera } from "@/services/cuenta-corriente";
import type { Exclusion } from "./exclusion";

export async function actualizarCartera(db: Firestore, empresa: string, clienteId: string, exclusion: Exclusion) {
  const movimientos = await db.collection(`empresas/${empresa}/movimientos`).where("clienteId", "==", clienteId).get();
  const proyeccion = proyectarCartera(movimientos.docs.map((d) => d.data() as Movimiento));
  await db.runTransaction(async (tx) => {
    await exclusion.verificar(tx);
    tx.set(db.doc(`empresas/${empresa}/carteraResumen/${clienteId}`), proyeccion);
  });
}

export async function leerCartera(db: Firestore, empresa: string): Promise<ResumenCartera> {
  const base = db.doc(`empresas/${empresa}`);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  return db.runTransaction(
    async (tx) => {
      const clientes = await tx.get(base.collection("clientes"));
      const resumenes = await tx.get(base.collection("carteraResumen"));
      const mapa = new Map(resumenes.docs.map((d) => [d.id, d.data() as ProyeccionCartera]));
      let cobradoMes = 0;
      const cuentas = [];
      for (const doc of clientes.docs) {
        const cliente = doc.data() as Cliente;
        let proyeccion = mapa.get(doc.id);
        if (!proyeccion) {
          // Compatibilidad: empresas anteriores se migran explícitamente desde Herramientas.
          const historial = await tx.get(base.collection("movimientos").where("clienteId", "==", doc.id));
          proyeccion = proyectarCartera(historial.docs.map((d) => d.data() as Movimiento));
        }
        cobradoMes += proyeccion.cobrosMes[hoy.slice(0, 7)] ?? 0;
        cuentas.push({ cliente, movimientos: proyeccion.abiertos, resumen: resumirCuenta(proyeccion.abiertos, hoy) });
      }
      const tramos = tramosVacios();
      let enLaCalle = 0,
        vencido = 0;
      for (const c of cuentas) {
        enLaCalle += c.resumen.deuda;
        vencido += c.resumen.vencido;
        for (const t of TRAMOS) tramos[t] += c.resumen.tramos[t];
      }
      return { cuentas, enLaCalle, vencido, cobradoMes, tramos };
    },
    { readOnly: true },
  );
}
