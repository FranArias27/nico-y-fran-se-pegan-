import type { Metadata } from "next";
import { RequirePermission } from "@/components/layout/require-permission";
import { ReportesView } from "@/components/reportes/reportes-view";

export const metadata: Metadata = { title: "Reportes" };

export default function Page() {
  return (
    <RequirePermission permiso="verReportes">
      <ReportesView />
    </RequirePermission>
  );
}
