import { auth } from "@/lib/firebase/client";

export async function pedirApi(url: string, init: RequestInit = {}) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Iniciá sesión para continuar");
  const respuesta = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await usuario.getIdToken()}` },
    cache: "no-store",
  });
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw Object.assign(new Error(datos.error ?? "No se pudo completar la operación"), {
      pendiente: datos.pendiente === true,
    });
  }
  return respuesta;
}

/** Guarda el pedido antes de enviarlo: un corte de red no crea otro id. */
export async function mutarGestion<T>(empresaId: string, pedido: object): Promise<T> {
  const clave = `el-tornillo:gestion:${empresaId}:${auth.currentUser?.uid}`;
  const firma = JSON.stringify(pedido);
  const previo = sessionStorage.getItem(clave);
  const guardado = previo ? (JSON.parse(previo) as { firma: string; cuerpo: string }) : null;
  if (guardado && guardado.firma !== firma)
    throw new Error("Hay un pedido pendiente: reintentá la misma operación con sus datos originales.");
  const cuerpo = guardado?.cuerpo ?? JSON.stringify({ empresaId, id: crypto.randomUUID(), pedido });
  sessionStorage.setItem(clave, JSON.stringify({ firma, cuerpo }));
  try {
    const respuesta = await pedirApi("/api/gestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
    });
    const datos = await respuesta.json();
    sessionStorage.removeItem(clave);
    return datos;
  } catch (e) {
    // Los errores HTTP definitivos liberan el borrador; un fallo de red lo conserva.
    if (e instanceof Error && "pendiente" in e && e.pendiente !== true) sessionStorage.removeItem(clave);
    throw e;
  }
}

export async function descargarApi(url: string, nombre: string) {
  const respuesta = await pedirApi(url);
  const enlace = document.createElement("a");
  const objeto = URL.createObjectURL(await respuesta.blob());
  enlace.href = objeto;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(objeto), 1000);
}
