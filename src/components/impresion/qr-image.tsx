"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Dibuja un código QR. Mientras se genera, marca data-cargando para la impresión. */
export function QrImage({ texto, tamano = 120, className }: { texto: string; tamano?: number; className?: string }) {
  const [url, setUrl] = useState<{ texto: string; dataUrl: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    QRCode.toDataURL(texto, { margin: 0, width: tamano * 2, errorCorrectionLevel: "M" }).then((dataUrl) => {
      if (vigente) setUrl({ texto, dataUrl });
    });
    return () => {
      vigente = false;
    };
  }, [texto, tamano]);

  if (!url || url.texto !== texto) {
    return <div data-cargando style={{ width: tamano, height: tamano }} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- data URL generada en el navegador
  return <img src={url.dataUrl} width={tamano} height={tamano} alt="Código QR" className={className} />;
}
