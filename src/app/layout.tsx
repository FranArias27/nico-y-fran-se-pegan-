import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/auth/auth-provider";
import { ImpresionProvider } from "@/components/impresion/impresion-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ServiciosProvider } from "@/components/providers/servicios-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "El Tornillo · Mostrador y cobranza",
    template: "%s · El Tornillo",
  },
  description: "Prototipo de punto de venta, stock, facturación y cuenta corriente.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <TooltipProvider>
            <AppShell>
              <ServiciosProvider>
                <ImpresionProvider>{children}</ImpresionProvider>
              </ServiciosProvider>
            </AppShell>
            <Toaster position="top-center" richColors />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
