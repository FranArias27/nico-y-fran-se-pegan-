import * as articulos from "./articulos";
import * as clientes from "./clientes";
import type { Contexto } from "./contexto";
import * as cc from "./cuenta-corriente";
import * as demo from "./demo";
import * as reportes from "./reportes";
import * as ventas from "./ventas";

/** Fachada de servicios con el contexto ya inyectado. Es lo único que usa la UI. */
export function crearServicios(ctx: Contexto) {
  return {
    articulos: {
      listar: () => articulos.listarArticulos(ctx),
      listarCategorias: () => articulos.listarCategorias(ctx),
      obtener: (id: string) => articulos.obtenerArticulo(ctx, id),
      guardar: (datos: articulos.DatosArticulo) => articulos.guardarArticulo(ctx, datos),
      previsualizarCambioMasivo: (categoriaId: string, variacion: number) =>
        articulos.previsualizarCambioMasivo(ctx, categoriaId, variacion),
      aplicarCambioMasivo: (categoriaId: string, variacion: number) =>
        articulos.aplicarCambioMasivo(ctx, categoriaId, variacion),
    },
    clientes: {
      listar: () => clientes.listarClientes(ctx),
      obtener: (id: string) => clientes.obtenerCliente(ctx, id),
      guardar: (datos: clientes.DatosCliente) => clientes.guardarCliente(ctx, datos),
    },
    cuentaCorriente: {
      deCliente: (clienteId: string) => cc.cuentaDeCliente(ctx, clienteId),
      registrarPago: (input: cc.NuevoPago) => cc.registrarPago(ctx, input),
      obtenerRecibo: (id: string) => cc.obtenerRecibo(ctx, id),
      cartera: () => cc.resumenCartera(ctx),
    },
    ventas: {
      registrar: (input: ventas.NuevaVenta) => ventas.registrarVenta(ctx, input),
      obtener: (id: string) => ventas.obtenerVenta(ctx, id),
      ponerEnEspera: (datos: Parameters<typeof ventas.ponerEnEspera>[1]) => ventas.ponerEnEspera(ctx, datos),
      listarEnEspera: () => ventas.listarEnEspera(ctx),
      retomarEnEspera: (id: string) => ventas.retomarEnEspera(ctx, id),
      descartarEnEspera: (id: string) => ventas.descartarEnEspera(ctx, id),
    },
    reportes: {
      generar: (filtro: reportes.FiltroReporte) => reportes.generarReporte(ctx, filtro),
    },
    demo: {
      reiniciar: () => demo.reiniciarDatosDemo(ctx),
      asegurarDatos: () => demo.asegurarDatosDemo(ctx),
      obtenerComercio: () => demo.obtenerComercio(ctx),
      guardarComercio: (comercio: Parameters<typeof demo.guardarComercio>[1]) => demo.guardarComercio(ctx, comercio),
    },
    pagos: ctx.pagos,
    ahora: ctx.ahora,
    /** Para refrescar la UI cuando cambian los datos. */
    alCambiar: (callback: () => void) => ctx.store.alCambiar(callback),
  };
}

export type Servicios = ReturnType<typeof crearServicios>;
export { ErrorDeNegocio } from "./contexto";
export { ErrorCodigos } from "./articulos";
