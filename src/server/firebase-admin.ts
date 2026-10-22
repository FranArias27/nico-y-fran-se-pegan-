import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Falta una variable de entorno: es un problema de instalación, no del usuario. */
export class ErrorConfiguracion extends Error {}

/**
 * Firebase Admin para el servidor. Necesita la variable de entorno
 * FIREBASE_SERVICE_ACCOUNT con el JSON de la cuenta de servicio del proyecto
 * (Firebase → Configuración del proyecto → Cuentas de servicio).
 * Saltea las reglas de seguridad: usarlo solo después de validar al usuario.
 */
function app(): App {
  if (getApps().length) return getApp();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new ErrorConfiguracion("Falta configurar FIREBASE_SERVICE_ACCOUNT en el servidor");
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
