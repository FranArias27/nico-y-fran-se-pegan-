import type { Metadata } from "next";
import { VentasView } from "@/components/ventas/ventas-view";

export const metadata: Metadata = { title: "Ventas" };

export default function Page() {
  return <VentasView />;
}
