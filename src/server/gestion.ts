import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  enteroSeguro,
  idSeguro,
  medioCompra,
  textoSeguro,
  validarLineasCompra,
  type Caja,
  type Compra,
  type PedidoGestion,
} from "@/domain/gestion";
import type { Recibo, Venta } from "@/domain/types";
import { calcularPrecios, precioDesdeMargen } from "@/domain/precios";
import { ErrorPedido } from "./acceso";
import { conExclusion, type Exclusion } from "./exclusion";

export async function exigirCaja(db: Firestore, empresa: string) {
  const caja = (await db.doc(`empresas/${empresa}/caja/actual`).get()).data() as Caja | undefined;
  if (!caja?.abierta) throw new ErrorPedido("Abrí la caja antes de registrar efectivo", 422);
  return caja;
}

export async function registrarEfectivo(
  db: Firestore,
  empresa: string,
  resultado: Venta | Recibo,
  exclusion?: Exclusion,
) {
  const importe =
    "lineas" in resultado
      ? resultado.pagos.filter((p) => p.medio === "efectivo").reduce((s, p) => s + p.importe, 0) *
        (resultado.clase === "nota_credito" ? -1 : 1)
      : resultado.medio === "efectivo"
        ? resultado.importe
        : 0;
  if (!importe) return;
  const base = db.doc(`empresas/${empresa}`);
  await db.runTransaction(async (tx) => {
    if (exclusion) await exclusion.verificar(tx);
    const mov = base.collection("cajaMovimientos").doc(resultado.id);
    const actual = base.collection("caja").doc("actual");
    const [hecho, snap] = await tx.getAll(mov, actual);
    if (hecho.exists) return;
    const caja = snap.data() as Caja | undefined;
    if (!caja?.abierta) throw new ErrorPedido("Falta abrir la caja para registrar el efectivo pendiente", 422);
    tx.create(mov, {
      id: resultado.id,
      sesionId: caja.sesionId,
      importe,
      fecha: resultado.fecha,
      motivo: "Comprobante o recibo",
      usuarioId: "vendedorId" in resultado ? resultado.vendedorId : resultado.usuarioId,
    });
    tx.update(actual, { esperado: FieldValue.increment(importe) });
  });
}

export async function ejecutarGestion(db: Firestore, empresa: string, uid: string, id: string, pedido: PedidoGestion) {
  idSeguro(id);
  return conExclusion(db, empresa, id, uid, pedido, async (exclusion) => {
    const base = db.doc(`empresas/${empresa}`);
    return db.runTransaction(async (tx) => {
      await exclusion.verificar(tx);
      const registro = base.collection("gestionRegistros").doc(id);
      const existente = await tx.get(registro);
      if (existente.exists) return existente.data()!;
      const actual = base.collection("caja").doc("actual");
      const caja = (await tx.get(actual)).data() as Caja | undefined;
      const fecha = new Date().toISOString();
      const resultado = { id, accion: pedido.accion, fecha, usuarioId: uid };
      // Todas las lecturas se completan antes de aplicar escrituras.
      const escrituras: (() => void)[] = [];
      function efectivo(importe: number, motivo: string) {
        if (!importe) return;
        if (!caja?.abierta) throw new ErrorPedido("Abrí la caja para registrar efectivo", 422);
        escrituras.push(() => {
          tx.update(actual, { esperado: FieldValue.increment(importe) });
          tx.create(base.collection("cajaMovimientos").doc(id), {
            ...resultado,
            sesionId: caja.sesionId,
            importe,
            motivo,
          });
        });
      }
      switch (pedido.accion) {
        case "abrir_caja": {
          enteroSeguro(pedido.importe);
          if (caja?.abierta) throw new ErrorPedido("La caja ya está abierta", 422);
          const nueva: Caja = {
            sesionId: id,
            abierta: true,
            apertura: pedido.importe,
            esperado: pedido.importe,
            abiertaEn: fecha,
          };
          escrituras.push(() => {
            tx.set(actual, nueva);
            tx.create(base.collection("cajas").doc(id), nueva);
          });
          break;
        }
        case "cerrar_caja": {
          enteroSeguro(pedido.importe);
          if (!caja?.abierta) throw new ErrorPedido("La caja está cerrada", 422);
          const cierre = {
            ...caja,
            abierta: false,
            cerradaEn: fecha,
            contado: pedido.importe,
            diferencia: pedido.importe - caja.esperado,
          };
          escrituras.push(() => {
            tx.set(actual, cierre);
            tx.set(base.collection("cajas").doc(caja.sesionId), cierre);
          });
          break;
        }
        case "movimiento_caja":
          enteroSeguro(pedido.importe, -1e12);
          if (!pedido.importe) throw new Error("El movimiento no puede ser cero");
          efectivo(pedido.importe, textoSeguro(pedido.motivo));
          break;
        case "proveedor": {
          const p = pedido.proveedor;
          const proveedor = {
            id: idSeguro(p.id),
            nombre: textoSeguro(p.nombre),
            documento: String(p.documento ?? "").slice(0, 30),
            telefono: String(p.telefono ?? "").slice(0, 40),
          };
          escrituras.push(() => tx.set(base.collection("proveedores").doc(proveedor.id), proveedor, { merge: true }));
          break;
        }
        case "compra": {
          validarLineasCompra(pedido.lineas);
          idSeguro(pedido.proveedorId);
          textoSeguro(pedido.comprobante);
          enteroSeguro(pedido.pagado);
          medioCompra(pedido.medio);
          const proveedor = await tx.get(base.collection("proveedores").doc(pedido.proveedorId));
          if (!proveedor.exists) throw new Error("El proveedor no existe");
          const repetida = await tx.get(
            base
              .collection("compras")
              .where("proveedorId", "==", pedido.proveedorId)
              .where("comprobante", "==", pedido.comprobante.trim())
              .limit(1),
          );
          if (!repetida.empty) throw new Error("Ese comprobante de compra ya fue registrado");
          let total = 0;
          for (const l of pedido.lineas) {
            const ref = base.collection("articulos").doc(l.articuloId);
            const costoRef = base.collection("costos").doc(l.articuloId);
            const [a, costo] = await tx.getAll(ref, costoRef);
            if (!a.exists) throw new Error("Uno de los artículos no existe");
            const articulo = a.data()!;
            const margen = costo.data()?.margen ?? 0;
            const precios = calcularPrecios(
              precioDesdeMargen(l.costo, margen),
              articulo.alicuotaIva,
              articulo.redondeo,
            );
            total +=
              Math.round((l.costo * l.cantidad) / 1000) +
              Math.round((Math.round((l.costo * l.cantidad) / 1000) * articulo.alicuotaIva) / 10000);
            escrituras.push(() => {
              tx.update(ref, { stock: FieldValue.increment(l.cantidad), ...precios, actualizadoEn: fecha });
              tx.set(costoRef, { costo: l.costo, margen });
              tx.create(base.collection("inventarioMovimientos").doc(`${id}-${l.articuloId}`), {
                ...resultado,
                articuloId: l.articuloId,
                delta: l.cantidad,
                motivo: "Recepción de compra",
              });
            });
          }
          enteroSeguro(total);
          if (pedido.pagado > total) throw new Error("El pago supera el total de la compra");
          const compra: Compra = {
            id,
            proveedorId: pedido.proveedorId,
            comprobante: pedido.comprobante.trim(),
            fecha,
            lineas: pedido.lineas,
            total,
            pagado: pedido.pagado,
          };
          escrituras.push(() => tx.create(base.collection("compras").doc(id), compra));
          escrituras.push(() => {
            tx.update(base.collection("proveedores").doc(pedido.proveedorId), {
              saldo: FieldValue.increment(total - pedido.pagado),
            });
            if (pedido.pagado > 0)
              tx.create(base.collection("pagosProveedores").doc(id), {
                ...resultado,
                compraId: id,
                proveedorId: pedido.proveedorId,
                importe: pedido.pagado,
                medio: pedido.medio,
              });
          });
          if (pedido.medio === "efectivo") efectivo(-pedido.pagado, "Pago inicial de compra");
          break;
        }
        case "pago_proveedor": {
          idSeguro(pedido.compraId);
          enteroSeguro(pedido.importe, 1);
          medioCompra(pedido.medio);
          const ref = base.collection("compras").doc(pedido.compraId);
          const compra = (await tx.get(ref)).data() as Compra | undefined;
          if (!compra || pedido.importe > compra.total - compra.pagado)
            throw new Error("El pago supera el saldo pendiente");
          escrituras.push(() => {
            tx.update(ref, { pagado: FieldValue.increment(pedido.importe) });
            tx.update(base.collection("proveedores").doc(compra.proveedorId), {
              saldo: FieldValue.increment(-pedido.importe),
            });
            tx.create(base.collection("pagosProveedores").doc(id), {
              ...resultado,
              compraId: compra.id,
              proveedorId: compra.proveedorId,
              importe: pedido.importe,
              medio: pedido.medio,
            });
          });
          if (pedido.medio === "efectivo") efectivo(-pedido.importe, "Pago a proveedor");
          break;
        }
        case "inventario": {
          idSeguro(pedido.articuloId);
          enteroSeguro(pedido.contado);
          enteroSeguro(pedido.esperado, -1e12);
          textoSeguro(pedido.motivo);
          const ref = base.collection("articulos").doc(pedido.articuloId);
          const articulo = (await tx.get(ref)).data();
          if (!articulo || articulo.stock !== pedido.esperado)
            throw new ErrorPedido("El stock cambió. Actualizá y repetí el conteo.", 409);
          escrituras.push(() => {
            tx.update(ref, { stock: pedido.contado, actualizadoEn: fecha });
            tx.create(base.collection("inventarioMovimientos").doc(id), {
              ...resultado,
              articuloId: pedido.articuloId,
              anterior: pedido.esperado,
              contado: pedido.contado,
              delta: pedido.contado - pedido.esperado,
              motivo: pedido.motivo,
            });
          });
          break;
        }
        default:
          throw new Error("Operación de gestión inválida");
      }
      for (const escribir of escrituras) escribir();
      tx.create(registro, resultado);
      tx.set(base.collection("control").doc("cambios"), { version: FieldValue.increment(1) }, { merge: true });
      return resultado;
    });
  });
}
