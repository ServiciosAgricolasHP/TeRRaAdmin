// Un almacén de clave y valor en IndexedDB del navegador, para lo que no cabe
// en localStorage (las listas sincronizadas, services/syncedList.js). Nunca
// lanza: sin IndexedDB (una ventana privada, los tests) o con un error, leer
// da `undefined` y escribir no hace nada.

const DB_NAME = "terra";
const STORE = "lists";

export const idbAvailable = () => typeof indexedDB !== "undefined";

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (!idbAvailable()) {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

// Corre una operación sobre el almacén y devuelve su resultado al terminar la
// transacción.
async function withStore(mode, operation) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const idbGet = (key) => withStore("readonly", (store) => store.get(key));
export const idbSet = (key, value) => withStore("readwrite", (store) => store.put(value, key));
export const idbDelete = (key) => withStore("readwrite", (store) => store.delete(key));
