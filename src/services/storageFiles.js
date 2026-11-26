// Archivos en Cloud Storage: subir, borrar y el enlace para verlos. Quién
// puede hacerlo lo deciden `storage.rules`. `firebase/storage` se carga recién
// con el primer uso, en un chunk aparte: la app no lo necesita para abrir.
import app from "../firebase";
import { inlineDisposition } from "../utils/attachments";
import { refreshStorageAccess } from "./storageAccess";

let loaded = null;
// Los enlaces ya pedidos en esta carga de la página, por ruta: la lista y el
// visor muestran el mismo archivo sin volver a pedirlo.
const urls = new Map();

// El SDK y el bucket, una sola vez. Con `VITE_STORAGE_EMULATOR`
// ("host:puerto") apunta al emulador, como `VITE_FIRESTORE_EMULATOR` en
// `firebase.js`.
function storageApi() {
  if (!loaded) {
    loaded = import("firebase/storage").then((sdk) => {
      const storage = sdk.getStorage(app);
      const emulator = import.meta.env.VITE_STORAGE_EMULATOR;
      if (emulator) {
        const [host, port] = String(emulator).split(":");
        sdk.connectStorageEmulator(storage, host, Number(port));
      }
      return { sdk, storage };
    });
  }
  return loaded;
}

// Corre `run` y, si las reglas lo rechazan, lo reintenta una vez con la marca
// de acceso de la sesión al día (`storageAccess.js`).
async function withAccess(run) {
  try {
    return await run();
  } catch (err) {
    if (err?.code !== "storage/unauthorized" || !(await refreshStorageAccess())) throw err;
    return run();
  }
}

// `fileName` es el nombre con que el navegador muestra y guarda el archivo.
export async function uploadFile(path, blob, contentType, fileName) {
  const { sdk, storage } = await storageApi();
  const metadata = { contentType, ...(fileName ? { contentDisposition: inlineDisposition(fileName) } : {}) };
  await withAccess(() => sdk.uploadBytes(sdk.ref(storage, path), blob, metadata));
}

// Un archivo que ya no está cuenta como borrado.
export async function deleteFile(path) {
  const { sdk, storage } = await storageApi();
  urls.delete(path);
  try {
    await withAccess(() => sdk.deleteObject(sdk.ref(storage, path)));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") throw err;
  }
}

// El enlace para ver o bajar el archivo. Lo entrega Storage después de revisar
// las reglas, y sirve en una imagen o en una pestaña nueva sin configurar CORS.
export async function fileUrl(path) {
  if (urls.has(path)) return urls.get(path);
  const { sdk, storage } = await storageApi();
  const url = await withAccess(() => sdk.getDownloadURL(sdk.ref(storage, path)));
  urls.set(path, url);
  return url;
}
