"use client";

import { MessageCircleIcon } from "lucide-react";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { aFechaISO } from "@/domain/fechas";
import { armarMensajeRecordatorio, linkWhatsApp } from "@/domain/whatsapp";
import type { Comercio } from "@/domain/types";
import { useConsulta } from "@/hooks/use-consulta";
import type { CuentaCliente } from "@/services/cuenta-corriente";

/** Abre WhatsApp con un recordatorio de pago armado (saldo, vencidos y link de pago). */
export function WhatsAppButton({
  cuenta,
  size = "default",
  soloIcono = false,
}: {
  cuenta: CuentaCliente;
  size?: "default" | "sm";
  soloIcono?: boolean;
}) {
  const servicios = useServicios();
  const { datos: comercio } = useConsulta((s) => s.demo.obtenerComercio());

  function abrir(c: Comercio) {
    const { cliente, resumen } = cuenta;
    const mensaje = armarMensajeRecordatorio({
      nombreCliente: cliente.nombreFantasia ?? cliente.razonSocial,
      nombreComercio: c.nombreFantasia,
      saldo: resumen.saldo,
      deudas: resumen.deudas,
      hoy: aFechaISO(servicios.ahora()),
      linkPago: servicios.pagos.crearLinkPago(cliente.id, resumen.saldo),
    });
    window.open(linkWhatsApp(cliente.telefono, mensaje), "_blank", "noopener");
  }

  return (
    <Button
      variant="outline"
      size={soloIcono ? (size === "sm" ? "icon-sm" : "icon") : size}
      disabled={!comercio || cuenta.resumen.saldo <= 0}
      onClick={() => comercio && abrir(comercio)}
      aria-label="Recordar por WhatsApp"
      title="Recordar por WhatsApp"
      className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
    >
      <MessageCircleIcon />
      {!soloIcono && "Recordar por WhatsApp"}
    </Button>
  );
}
