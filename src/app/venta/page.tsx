import type { Metadata } from "next";
import { VentaView } from "@/components/venta/venta-view";

export const metadata: Metadata = { title: "Venta" };

export default function Page() {
  return <VentaView />;
}
