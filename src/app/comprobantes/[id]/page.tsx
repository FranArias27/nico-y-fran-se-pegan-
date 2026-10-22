import type { Metadata } from "next";
import { ComprobanteView } from "@/components/impresion/comprobante-view";

export const metadata: Metadata = { title: "Comprobante" };

export default function Page() {
  return <ComprobanteView />;
}
