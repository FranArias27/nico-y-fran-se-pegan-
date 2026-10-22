import type { Rango } from "@/domain/fechas";
import type {
  Articulo,
  Categoria,
  Cliente,
  Comercio,
  Milesimas,
  Movimiento,
  Recibo,
  Venta,
  VentaEnEspera,
} from "@/domain/types";

/**
 * Contratos de acceso a datos. La UI nunca los usa directamente: pasa por los
 * servicios (src/services). Hoy los implementa IndexedDB en el navegador
 * (./indexeddb); para pasar a Postgres alcanza con otra implementación.
 */

export interface ComercioRepo {
  obtener(): Promise<Comercio>;
  guardar(comercio: Comercio): Promise<void>;
}

export interface CategoriasRepo {
  listar(): Promise<Categoria[]>;
}

export interface ArticulosRepo {
  listar(): Promise<Articulo[]>;
  obtener(id: string): Promise<Articulo | undefined>;
  guardar(articulo: Articulo): Promise<void>;
  guardarVarios(articulos: Articulo[]): Promise<void>;
  /** Suma (o resta) stock. Puede quedar negativo. */
  ajustarStock(id: string, delta: Milesimas): Promise<void>;
}

export interface ClientesRepo {
  listar(): Promise<Cliente[]>;
  obtener(id: string): Promise<Cliente | undefined>;
  guardar(cliente: Cliente): Promise<void>;
}

export interface VentasRepo {
  /** Ventas del rango de fechas (locales, inclusive) o todas. */
  listar(rango?: Rango): Promise<Venta[]>;
  listarPorCliente(clienteId: string): Promise<Venta[]>;
  /** Notas de crédito emitidas sobre una venta, de la más vieja a la más nueva. */
  listarNotasDe(ventaId: string): Promise<Venta[]>;
  obtener(id: string): Promise<Venta | undefined>;
  agregar(venta: Venta): Promise<void>;
}

export interface MovimientosRepo {
  listar(): Promise<Movimiento[]>;
  listarPorCliente(clienteId: string): Promise<Movimiento[]>;
  guardar(movimiento: Movimiento): Promise<void>;
  guardarVarios(movimientos: Movimiento[]): Promise<void>;
}

export interface RecibosRepo {
  listarPorCliente(clienteId: string): Promise<Recibo[]>;
  obtener(id: string): Promise<Recibo | undefined>;
  agregar(recibo: Recibo): Promise<void>;
}

export interface EnEsperaRepo {
  listar(): Promise<VentaEnEspera[]>;
  guardar(venta: VentaEnEspera): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface ContadoresRepo {
  /** Devuelve el próximo número de la secuencia (por ejemplo "B-0001"). */
  siguiente(clave: string): Promise<number>;
}

export interface DatosIniciales {
  comercio: Comercio;
  categorias: Categoria[];
  articulos: Articulo[];
  clientes: Cliente[];
  ventas: Venta[];
  movimientos: Movimiento[];
  recibos: Recibo[];
  contadores: Record<string, number>;
}

export interface Store {
  comercio: ComercioRepo;
  categorias: CategoriasRepo;
  articulos: ArticulosRepo;
  clientes: ClientesRepo;
  ventas: VentasRepo;
  movimientos: MovimientosRepo;
  recibos: RecibosRepo;
  enEspera: EnEsperaRepo;
  contadores: ContadoresRepo;
  /**
   * Ejecuta las operaciones de forma atómica. Dentro de `fn` solo se pueden
   * esperar operaciones del propio store (no llamadas a servicios externos).
   */
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
  estaVacio(): Promise<boolean>;
  /** Borra todo y carga los datos indicados. */
  reemplazarTodo(datos: DatosIniciales): Promise<void>;
  /** Se llama después de cada escritura confirmada. */
  alCambiar(callback: () => void): () => void;
}
