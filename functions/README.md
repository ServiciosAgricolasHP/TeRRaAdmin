# Cloud Functions — adminAgrofrutos

Backend mínimo para `arandanos-hp`. Hoy solo expone un callable `ping` de prueba; sirve como base para agregar funciones cuando hagan falta (ej. proxies a APIs de terceros, jobs, integraciones).

## Convenciones

- **Runtime**: Node 20.
- **Versión de Functions**: v2 (`firebase-functions/v2`). Más barata, soporta Secret Manager nativo, mejor control de concurrencia.
- **Región**: `southamerica-west1` (Santiago). Definida como default en `setGlobalOptions` de [index.js](index.js).
- **Auth**: las callable se exponen con `onCall`. El cliente las invoca con `httpsCallable`, que adjunta automáticamente el ID token del usuario logueado. Dentro de la función se valida con `request.auth` (rechazar si no existe).
- **Secrets**: para API keys de terceros usar `defineSecret("NOMBRE")` + `runWith({ secrets: ["NOMBRE"] })`. Setearlos con `firebase functions:secrets:set NOMBRE`. NUNCA en `.env` ni en código.

## Prerequisitos para deployar

1. **Plan Blaze (pay-as-you-go)** activo en el proyecto Firebase. Cloud Functions no funciona en Spark. Hay free tier (2M invocaciones / 400 K GB-segundos por mes) pero requiere tarjeta registrada.
2. **Firebase CLI** instalado y logueado: `npm i -g firebase-tools` + `firebase login`.
3. **APIs habilitadas** en GCP (las activa el primer deploy automáticamente): Cloud Functions, Cloud Build, Artifact Registry, Cloud Run.

## Setup local

```bash
cd functions
npm install
```

## Deploy

Deploy manual, fuera del pipeline de GitHub Actions (el CI/CD del repo solo cubre el frontend — ver `.github/workflows/`). Automatizarlo requeriría guardar credenciales de Firebase como secret en GitHub, así que por ahora se deploya a mano cuando haga falta.

Desde la raíz del repo:

```bash
firebase deploy --only functions
```

Para deployar una función específica:

```bash
firebase deploy --only functions:ping
```

## Logs

```bash
firebase functions:log
# o filtrando una función
firebase functions:log --only ping
```

## Test rápido desde el cliente

```js
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../firebase";

const functions = getFunctions(app, "southamerica-west1");
const ping = httpsCallable(functions, "ping");

const { data } = await ping();
console.log(data); // { ok: true, uid, email, serverTime }
```

## Agregar una función nueva

Patrón recomendado para una callable que llama a un servicio externo con secret:

```js
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const MI_API_KEY = defineSecret("MI_API_KEY");

export const miFuncion = onCall(
  { secrets: [MI_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    // validá request.data acá
    const res = await fetch("https://servicio-externo/...", {
      headers: { "X-API-Key": MI_API_KEY.value() },
    });
    if (!res.ok) throw new HttpsError("internal", "Upstream error");
    return await res.json();
  },
);
```
