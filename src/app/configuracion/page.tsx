import type { Metadata } from "next";
import { ConfiguracionView } from "@/components/configuracion/configuracion-view";

export const metadata: Metadata = { title: "Configuración" };

export default function Page() {
  return <ConfiguracionView />;
}
