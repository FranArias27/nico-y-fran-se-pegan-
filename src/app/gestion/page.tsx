import { RequirePermission } from "@/components/layout/require-permission";
import { GestionView } from "@/components/gestion/gestion-view";
export const metadata = { title: "Caja y mercadería" };
export default function Page() {
  return (
    <RequirePermission permiso="configurar">
      <GestionView />
    </RequirePermission>
  );
}
