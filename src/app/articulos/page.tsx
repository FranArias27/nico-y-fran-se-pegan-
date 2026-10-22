import type { Metadata } from "next";
import { ArticulosView } from "@/components/articulos/articulos-view";

export const metadata: Metadata = { title: "Artículos" };

export default function Page() {
  return <ArticulosView />;
}
