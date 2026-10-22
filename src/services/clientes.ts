import type { Cliente } from "@/domain/types";
import { CLIENTE_CONSUMIDOR_FINAL_ID } from "@/domain/types";
import { ErrorDeNegocio, type Contexto } from "./contexto";

export async function listarClientes(ctx: Contexto): Promise<Cliente[]> {
  const clientes = await ctx.store.clientes.listar();
  // Consumidor final primero, el resto por nombre.
  return clientes.sort((a, b) =>
    a.id === CLIENTE_CONSUMIDOR_FINAL_ID
      ? -1
      : b.id === CLIENTE_CONSUMIDOR_FINAL_ID
        ? 1
        : a.razonSocial.localeCompare(b.razonSocial, "es"),
  );
}

export function obtenerCliente(ctx: Contexto, id: string) {
  return ctx.store.clientes.obtener(id);
}

export type DatosCliente = Omit<Cliente, "id" | "creadoEn"> & { id?: string; creadoEn?: string };

export async function guardarCliente(ctx: Contexto, datos: DatosCliente): Promise<Cliente> {
  const razonSocial = datos.razonSocial.trim();
  if (!razonSocial) throw new ErrorDeNegocio("La razón social o el nombre es obligatorio");

  const documento = datos.documento.replace(/\D/g, "");
  if (datos.condicionIva === "RI" && documento.length !== 11) {
    throw new ErrorDeNegocio("Un responsable inscripto necesita un CUIT de 11 dígitos");
  }
  if (datos.limiteCredito < 0 || datos.plazoDias < 0) {
    throw new ErrorDeNegocio("El límite y el plazo no pueden ser negativos");
  }

  const cliente: Cliente = {
    ...datos,
    id: datos.id ?? ctx.nuevoId(),
    razonSocial,
    nombreFantasia: datos.nombreFantasia?.trim() || undefined,
    documento,
    creadoEn: datos.creadoEn ?? ctx.ahora().toISOString(),
  };
  await ctx.store.clientes.guardar(cliente);
  return cliente;
}
