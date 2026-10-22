import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const app = getApps().length ? getApp() : initializeApp({
  apiKey: "AIzaSyA3MGQekdDRpHl4pa5gJxxv6DpDoH983dM",
  authDomain: "eltornillo-6af7d.firebaseapp.com",
  projectId: "eltornillo-6af7d",
  storageBucket: "eltornillo-6af7d.firebasestorage.app",
  messagingSenderId: "58510478788",
  appId: "1:58510478788:web:81f34b91183fdb2874a891",
});

function crearFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      // Los tipos del dominio usan campos opcionales; Firestore rechaza `undefined`.
      ignoreUndefinedProperties: true,
      // Caché local en el navegador: el mostrador sigue leyendo si se corta internet.
      localCache:
        typeof window === "undefined"
          ? memoryLocalCache()
          : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Ya estaba inicializado (recarga en caliente durante el desarrollo).
    return getFirestore(app);
  }
}

export const auth = getAuth(app);
export const firestore = crearFirestore();
