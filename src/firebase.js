import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

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
// Cloud Functions client — apuntado a la misma región del deploy.
export const functions = getFunctions(app, "southamerica-west1");

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
