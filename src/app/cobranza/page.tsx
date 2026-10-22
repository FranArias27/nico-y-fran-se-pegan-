import type { Metadata } from "next";
import { CobranzaView } from "@/components/cobranza/cobranza-view";

export const metadata: Metadata = { title: "Cobranza" };

export default function Page() {
  return <CobranzaView />;
}
