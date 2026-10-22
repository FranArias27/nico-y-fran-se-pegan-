import { Login } from "@/components/auth/login";
export default async function Page({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa } = await params;
  return <Login empresaId={empresa} />;
}
