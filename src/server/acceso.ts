import { adminAuth, adminDb, ErrorConfiguracion } from "./firebase-admin";

/** Error con un mensaje para mostrar y el código HTTP que corresponde. */
export class ErrorPedido extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

/** Usuario que hace el pedido, a partir del token de Firebase en el encabezado Authorization. */
export async function usuarioDelPedido(request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new ErrorPedido("Falta iniciar sesión", 401);
  try {
    return (await adminAuth().verifyIdToken(token)).uid;
  } catch (e) {
    if (e instanceof ErrorConfiguracion) throw e;
    throw new ErrorPedido("La sesión venció. Volvé a iniciar sesión.", 401);
  }
}

/**
 * Verifica que el usuario trabaje en la empresa (o sea superadmin) y que la
 * empresa esté activa. Con `soloAdmin`, además tiene que ser administrador.
 * Devuelve si la empresa es de demostración.
 */
export async function validarAcceso(
  uid: string,
  empresaId: string,
  opciones: { soloAdmin?: boolean } = {},
): Promise<{ demo: boolean }> {
  if (!/^[a-z0-9-]{1,60}$/.test(empresaId)) throw new ErrorPedido("Empresa inválida", 400);
  const db = adminDb();
  const [usuario, empresa] = await Promise.all([db.doc(`usuarios/${uid}`).get(), db.doc(`empresas/${empresaId}`).get()]);
  const perfil = usuario.data();
  const general = perfil?.activo === true && perfil.rol === "superadmin";
  const miembro = perfil?.activo === true && perfil.empresaId === empresaId;
  if (!general && !miembro) throw new ErrorPedido("No tenés acceso a esta empresa", 403);
  if (opciones.soloAdmin && !general && perfil?.rol !== "admin") {
    throw new ErrorPedido("Solo un administrador puede hacer esto", 403);
  }
  if (empresa.data()?.activa !== true) throw new ErrorPedido("La empresa está deshabilitada", 403);
  return { demo: empresa.data()?.demo === true };
}

/** Respuesta JSON para cualquier error de un endpoint. */
export function respuestaDeError(e: unknown, extra?: (e: unknown) => Response | undefined): Response {
  if (e instanceof ErrorPedido) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof ErrorConfiguracion) return Response.json({ error: e.message }, { status: 503 });
  const propia = extra?.(e);
  if (propia) return propia;
  console.error(e);
  return Response.json({ error: "Error interno del servidor" }, { status: 500 });
}
