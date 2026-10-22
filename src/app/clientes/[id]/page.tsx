import type { Metadata } from "next";
import { ClienteDetalleView } from "@/components/clientes/cliente-detalle-view";

export const metadata: Metadata = { title: "Cuenta corriente" };

export default function Page() {
  return <ClienteDetalleView />;
}
