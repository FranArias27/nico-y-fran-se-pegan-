import { formatDate, formatMoney } from "@/lib/format";
import { diasVencido, type DeudaPendiente } from "./cuenta-corriente";
import type { Centavos, FechaISO } from "./types";

/**
 * Normaliza un teléfono argentino al formato internacional que espera wa.me
 * (54 + 9 + código de área + número, sin 0 ni 15). Devuelve null si no parece
 * un número válido.
 */
export function normalizarTelefonoAR(telefono: string): string | null {
  let digitos = telefono.replace(/\D/g, "");
  if (digitos.startsWith("54")) digitos = digitos.slice(2);
  if (digitos.startsWith("9")) digitos = digitos.slice(1);
  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  // Quita el "15" después del código de área (2 a 4 dígitos).
  for (const largoArea of [2, 3, 4]) {
    if (digitos.length === 12 && digitos.slice(largoArea, largoArea + 2) === "15") {
      digitos = digitos.slice(0, largoArea) + digitos.slice(largoArea + 2);
      break;
    }
  }
  if (digitos.length !== 10) return null;
  return `549${digitos}`;
}

export interface DatosRecordatorio {
  nombreCliente: string;
  nombreComercio: string;
  saldo: Centavos;
  deudas: readonly DeudaPendiente[];
  hoy: FechaISO;
  linkPago?: string;
}

/** Comprobantes vencidos que se detallan uno por uno; el resto va resumido. */
const MAX_DETALLE = 5;

export function armarMensajeRecordatorio(datos: DatosRecordatorio): string {
  const vencidas = datos.deudas.filter((d) => diasVencido(d.debito.vencimiento, datos.hoy) > 0);
  const lineas = [
    `Hola ${datos.nombreCliente}, ¿cómo estás? Te escribimos de ${datos.nombreComercio}.`,
    `Te recordamos que tu saldo en cuenta corriente es de ${formatMoney(datos.saldo)}.`,
  ];
  if (vencidas.length > 0) {
    lineas.push("", "Comprobantes vencidos:");
    for (const d of vencidas.slice(0, MAX_DETALLE)) {
      const dias = diasVencido(d.debito.vencimiento, datos.hoy);
      lineas.push(
        `• ${d.debito.descripcion}: ${formatMoney(d.pendiente)} (venció el ${formatDate(
          d.debito.vencimiento + "T00:00:00",
        )}, hace ${dias} ${dias === 1 ? "día" : "días"})`,
      );
    }
    if (vencidas.length > MAX_DETALLE) {
      const resto = vencidas.slice(MAX_DETALLE);
      const importe = resto.reduce((t, d) => t + d.pendiente, 0);
      lineas.push(`• y ${resto.length} comprobantes vencidos más por ${formatMoney(importe)}`);
    }
  }
  if (datos.linkPago) lineas.push("", `Podés pagar desde este link: ${datos.linkPago}`);
  lineas.push("", "¡Muchas gracias!");
  return lineas.join("\n");
}

/** Link wa.me con el mensaje armado. Sin teléfono válido, abre WhatsApp para elegir el contacto. */
export function linkWhatsApp(telefono: string | undefined, mensaje: string): string {
  const numero = telefono ? normalizarTelefonoAR(telefono) : null;
  const texto = encodeURIComponent(mensaje);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}
