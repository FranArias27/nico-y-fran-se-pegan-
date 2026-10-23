import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { adminDb } from "../src/server/firebase-admin";
import { credencialActiva } from "../src/server/arca/credenciales";
import { crearStoreAdmin } from "../src/server/store-admin";
import { ejecutarOperacion } from "../src/server/operaciones/ejecutar";
import { armarLineas } from "../src/domain/carrito";
import type { Venta } from "../src/domain/types";
import type { Pedido } from "../src/server/operaciones/pedido";

/** Cada caso indica una empresa de homologación preparada para A, B o C. */
async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error("Uso: npm run validar:arca -- casos-homologacion.json (ver ARCA.md)");
  const casos = JSON.parse(await readFile(archivo, "utf8")) as {
    empresaId: string;
    usuarioId: string;
    clienteId: string;
    articuloId: string;
    tipo: "A" | "B" | "C";
  }[];
  if (!Array.isArray(casos) || !casos.length) throw new Error("Indicá al menos un caso");
  for (const caso of casos) {
    const empresa = (await adminDb().doc(`empresas/${caso.empresaId}`).get()).data();
    if (!empresa?.activa || empresa.demo === true) throw new Error("Los casos deben usar empresas reales activas, exclusivas de homologación");
    if (!["A", "B", "C"].includes(caso.tipo)) throw new Error("Tipo inválido");
    const credencial = await credencialActiva(caso.empresaId);
    if (credencial?.entorno !== "homologacion") throw new Error(`Solo se permite homologación: ${caso.empresaId}`);
    const store = crearStoreAdmin(adminDb(), caso.empresaId);
    const a = await store.articulos.obtener(caso.articuloId);
    if (!a) throw new Error("El artículo no existe");
    const items = [{ articuloId: a.id, cantidad: 2000 }];
    const total = armarLineas(caso.tipo, items, new Map([[a.id, a]])).calculo.totales.total;
    const pedido: Pedido = {
      empresaId: caso.empresaId,
      id: randomUUID(),
      accion: "venta",
      datos: { tipo: caso.tipo, clienteId: caso.clienteId, items, pagos: [{ medio: "transferencia", importe: total }] },
    };
    const v = (await ejecutarOperacion(caso.usuarioId, pedido)) as Venta;
    const repetida = (await ejecutarOperacion(caso.usuarioId, pedido)) as Venta;
    if (v.id !== repetida.id || v.numero !== repetida.numero || v.fiscal?.cae !== repetida.fiscal?.cae)
      throw new Error("Falló la idempotencia");
    const notas: Pedido[] = [0, 1].map(() => ({
      empresaId: caso.empresaId,
      id: randomUUID(),
      accion: "nota_credito",
      datos: {
        ventaId: v.id,
        devoluciones: [{ articuloId: a.id, cantidad: 1000 }],
        reintegro: "transferencia",
        reponerStock: true,
      },
    }));
    const resultados = await Promise.allSettled(notas.map((p) => ejecutarOperacion(caso.usuarioId, p)));
    for (let i = 0; i < resultados.length; i++)
      if (resultados[i].status === "rejected") await ejecutarOperacion(caso.usuarioId, notas[i]);
    const emitidas = await store.ventas.listarNotasDe(v.id);
    if (emitidas.length !== 2 || emitidas.reduce((s, n) => s + n.totales.total, 0) !== v.totales.total)
      throw new Error("Falló la devolución parcial/total");
    console.log(
      `OK ${caso.tipo}: factura, reintento, dos notas concurrentes, cantidades e importes conciliados (${v.id}).`,
    );
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
