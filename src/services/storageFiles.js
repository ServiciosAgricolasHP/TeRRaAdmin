// Archivos en Cloud Storage: subir, borrar y el enlace para verlos. Quién
// puede hacerlo lo deciden `storage.rules`. `firebase/storage` se carga recién
// con el primer uso, en un chunk aparte: la app no lo necesita para abrir.
import app from "../firebase";
import { refreshStorageAccess } from "./storageAccess";

let loaded = null;

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

export async function uploadFile(path, blob, contentType) {
  const { sdk, storage } = await storageApi();
  await withAccess(() => sdk.uploadBytes(sdk.ref(storage, path), blob, { contentType }));
}

// Un archivo que ya no está cuenta como borrado.
export async function deleteFile(path) {
  const { sdk, storage } = await storageApi();
  try {
    await withAccess(() => sdk.deleteObject(sdk.ref(storage, path)));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") throw err;
  }
}

// El enlace para ver o bajar el archivo. Lo entrega Storage después de revisar
// las reglas, y sirve en una imagen o en una pestaña nueva sin configurar CORS.
export async function fileUrl(path) {
  const { sdk, storage } = await storageApi();
  return withAccess(() => sdk.getDownloadURL(sdk.ref(storage, path)));
}
