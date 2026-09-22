import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: "G-CKV2C8FR8Y",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, "hpdatabase");
export const auth = getAuth(app);

// No hay cliente de Cloud Functions a propósito. El backend no se invoca por
// HTTP: se le escribe un documento en `functionJobs` y un trigger de Firestore
// lo levanta (ver functions/index.js para por qué no se puede de la otra
// forma). Sacar `firebase/functions` del import también lo saca del bundle.

// Enganche del emulador. Solo se activa si `VITE_FIRESTORE_EMULATOR` viene
// puesta como "host:puerto". En producción la variable no existe, así que esto
// es código muerto en el bundle.
//
// Lo usan los tests de integración, y también sirve para levantar la app
// entera contra datos descartables:
//   VITE_FIRESTORE_EMULATOR=127.0.0.1:8080 VITE_FIREBASE_PROJECT_ID=demo-terra-test npm run dev
//
// El project id "demo-*" es la barrera de fondo: con ese prefijo el SDK nunca
// contacta servidores de Google, ni siquiera si esta conexión fallara.
const emulatorHost = import.meta.env.VITE_FIRESTORE_EMULATOR;
if (emulatorHost) {
  const [host, port] = String(emulatorHost).split(":");
  connectFirestoreEmulator(db, host, Number(port));
}

export default app;
