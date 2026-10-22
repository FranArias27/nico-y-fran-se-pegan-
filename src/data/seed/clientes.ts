import type { CondicionIva, EstadoCliente } from "@/domain/types";

/**
 * Cómo paga cada cliente en el historial simulado:
 * - `atraso`: días después del vencimiento en que suele pagar (negativo = paga antes).
 * - `dejaDePagarHace`: días atrás desde los que no paga más (morosos).
 * - `parcial`: fracción de lo vencido que paga cada vez.
 */
export interface PerfilPago {
  atraso: number;
  dejaDePagarHace?: number;
  parcial?: number;
}

export interface ClienteSemilla {
  id: string;
  razonSocial: string;
  nombreFantasia?: string;
  condicionIva: CondicionIva;
  /** Prefijo del CUIT (20, 23, 27, 30, 33) o "dni" para consumidores finales. */
  tipoDoc: "20" | "27" | "30" | "33" | "dni";
  domicilio: string;
  cuentaCorriente?: { limite: number; plazo: number; perfil: PerfilPago };
  estado?: EstadoCliente;
  /** Frecuencia relativa de compra. */
  frecuencia: number;
  notas?: string;
}

export const CLIENTES: ClienteSemilla[] = [
  // Consumidores finales
  { id: "cli-01", razonSocial: "Roberto Sánchez", condicionIva: "CF", tipoDoc: "dni", domicilio: "Pasaje Los Andes 342, Lanús", cuentaCorriente: { limite: 150000, plazo: 30, perfil: { atraso: -7 } }, frecuencia: 2, notas: "Vecino de toda la vida. Paga a fin de mes." },
  { id: "cli-02", razonSocial: "María Elena Paz", condicionIva: "CF", tipoDoc: "dni", domicilio: "Av. 9 de Julio 1820, Lanús", cuentaCorriente: { limite: 400000, plazo: 30, perfil: { atraso: 5 } }, frecuencia: 1.5 },
  { id: "cli-03", razonSocial: "Jorge Giménez", condicionIva: "CF", tipoDoc: "dni", domicilio: "Ituzaingó 1145, Lanús", frecuencia: 1 },
  { id: "cli-04", razonSocial: "Lorena Villalba", condicionIva: "CF", tipoDoc: "dni", domicilio: "Margarita Weild 2210, Lanús", frecuencia: 0.8 },
  { id: "cli-05", razonSocial: "Nicolás Herrera", condicionIva: "CF", tipoDoc: "dni", domicilio: "Carlos Pellegrini 905, Lanús", frecuencia: 0.8 },

  // Monotributistas (oficios)
  { id: "cli-06", razonSocial: "Walter Medina", nombreFantasia: "Plomería Medina", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Tucumán 2650, Remedios de Escalada", cuentaCorriente: { limite: 3000000, plazo: 15, perfil: { atraso: 12 } }, frecuencia: 4 },
  { id: "cli-07", razonSocial: "Hernán Castro", nombreFantasia: "Electricidad Castro", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Hipólito Yrigoyen 5320, Lanús", cuentaCorriente: { limite: 2000000, plazo: 15, perfil: { atraso: 10, dejaDePagarHace: 50 } }, estado: "observacion", frecuencia: 4, notas: "Dejó de pagar hace un mes y medio. Llamar antes de fiarle." },
  { id: "cli-08", razonSocial: "Pablo Romero", nombreFantasia: "Gas Romero", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Rivadavia 1430, Lanús", cuentaCorriente: { limite: 1200000, plazo: 30, perfil: { atraso: -7 } }, frecuencia: 3 },
  { id: "cli-09", razonSocial: "Sergio Benítez", nombreFantasia: "Pinturas Benítez", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Sarmiento 760, Valentín Alsina", cuentaCorriente: { limite: 1000000, plazo: 15, perfil: { atraso: 24 } }, frecuencia: 3 },
  { id: "cli-10", razonSocial: "Claudio Ojeda", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Uriburu 1220, Lanús", cuentaCorriente: { limite: 800000, plazo: 7, perfil: { atraso: 6 } }, frecuencia: 2.5 },
  { id: "cli-11", razonSocial: "Gustavo Ledesma", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Anatole France 1890, Lanús", frecuencia: 1.2 },
  { id: "cli-12", razonSocial: "Silvia Acosta", nombreFantasia: "Reformas SA-AC", condicionIva: "MONOTRIBUTO", tipoDoc: "27", domicilio: "Caaguazú 2045, Lanús", cuentaCorriente: { limite: 1000000, plazo: 15, perfil: { atraso: 15, dejaDePagarHace: 75 } }, estado: "bloqueado", frecuencia: 2.5, notas: "Bloqueada por falta de pago. Solo contado." },
  { id: "cli-13", razonSocial: "Ramón Díaz", nombreFantasia: "Albañilería Díaz", condicionIva: "MONOTRIBUTO", tipoDoc: "20", domicilio: "Salta 3310, Remedios de Escalada", cuentaCorriente: { limite: 2500000, plazo: 15, perfil: { atraso: 2 } }, frecuencia: 3 },
  { id: "cli-14", razonSocial: "Verónica Luna", condicionIva: "MONOTRIBUTO", tipoDoc: "27", domicilio: "Florida 412, Lanús", cuentaCorriente: { limite: 500000, plazo: 15, perfil: { atraso: 9 } }, frecuencia: 1.5 },

  // Responsables inscriptos
  { id: "cli-15", razonSocial: "Construcciones del Sur S.R.L.", nombreFantasia: "ConSur Obras", condicionIva: "RI", tipoDoc: "30", domicilio: "Av. Remedios de Escalada de San Martín 2980, Lanús", cuentaCorriente: { limite: 5000000, plazo: 30, perfil: { atraso: 11 } }, frecuencia: 4 },
  { id: "cli-16", razonSocial: "Desarrollos Lanús S.R.L.", nombreFantasia: "DL Obras", condicionIva: "RI", tipoDoc: "30", domicilio: "Av. Hipólito Yrigoyen 4100, Lanús", cuentaCorriente: { limite: 3000000, plazo: 30, perfil: { atraso: 8, parcial: 0.5, dejaDePagarHace: 40 } }, estado: "observacion", frecuencia: 3.5, notas: "Paga en cuotas. Pidió plan de pagos." },
  { id: "cli-17", razonSocial: "Electro Norte S.R.L.", nombreFantasia: "Electro Norte", condicionIva: "RI", tipoDoc: "30", domicilio: "Guidi 1560, Lanús", cuentaCorriente: { limite: 1500000, plazo: 30, perfil: { atraso: -7 } }, frecuencia: 3 },
  { id: "cli-18", razonSocial: "Metalúrgica Quilmes S.R.L.", nombreFantasia: "MetalQ", condicionIva: "RI", tipoDoc: "30", domicilio: "Av. Calchaquí 3450, Quilmes", cuentaCorriente: { limite: 2000000, plazo: 45, perfil: { atraso: 4 } }, frecuencia: 2.5 },
  { id: "cli-19", razonSocial: "Mantenimiento Integral S.R.L.", nombreFantasia: "MI Servicios", condicionIva: "RI", tipoDoc: "30", domicilio: "Pringles 830, Lanús", cuentaCorriente: { limite: 1500000, plazo: 15, perfil: { atraso: 20 } }, frecuencia: 3 },
  { id: "cli-20", razonSocial: "Distribuidora Avellaneda S.A.", condicionIva: "RI", tipoDoc: "30", domicilio: "Av. Mitre 1250, Avellaneda", frecuencia: 1.5 },
  { id: "cli-21", razonSocial: "Fernando Ruiz", nombreFantasia: "Carpintería Ruiz", condicionIva: "RI", tipoDoc: "20", domicilio: "José C. Paz 1450, Lanús", cuentaCorriente: { limite: 800000, plazo: 30, perfil: { atraso: -7 } }, frecuencia: 2 },
  { id: "cli-22", razonSocial: "Pereyra Hermanos S.H.", nombreFantasia: "Taller Los Hermanos", condicionIva: "RI", tipoDoc: "30", domicilio: "Bustamante 2230, Lanús", cuentaCorriente: { limite: 1200000, plazo: 30, perfil: { atraso: 10, dejaDePagarHace: 60 } }, frecuencia: 2 },
  { id: "cli-23", razonSocial: "Vidriería Cristal S.R.L.", nombreFantasia: "Cristal", condicionIva: "RI", tipoDoc: "30", domicilio: "Oliden 1980, Lanús", frecuencia: 1 },

  // Exentos
  { id: "cli-24", razonSocial: "Club Atlético Villa Industria", condicionIva: "EXENTO", tipoDoc: "30", domicilio: "Malabia 1100, Lanús", cuentaCorriente: { limite: 300000, plazo: 30, perfil: { atraso: 13 } }, frecuencia: 1 },
  { id: "cli-25", razonSocial: "Parroquia San José", condicionIva: "EXENTO", tipoDoc: "30", domicilio: "Av. 25 de Mayo 450, Lanús", frecuencia: 0.5 },
];
