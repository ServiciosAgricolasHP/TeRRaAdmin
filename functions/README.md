# Cloud Functions — TeRRaAdmin

Backend mínimo para `arandanos-hp`. Hoy solo expone un callable `ping` de prueba; sirve como base para agregar funciones cuando hagan falta (ej. proxies a APIs de terceros, jobs, integraciones).

> **Estado**: el código de `ping` está escrito y funciona, pero **la versión v1 todavía no está desplegada** — ver "Migrar de v2 a v1" más abajo.

## Convenciones

- **Runtime**: Node 20.
- **Versión de Functions**: **v1** (`firebase-functions/v1`), a propósito. Ver el porqué abajo.
- **Región**: `southamerica-west1` (Santiago). Se declara por función con `.region(...)`, no con `setGlobalOptions` (eso es API de v2).
- **Auth**: las callable se exponen con `functions.region(...).https.onCall(...)`. El cliente las invoca con `httpsCallable`, que adjunta automáticamente el ID token del usuario logueado. Dentro de la función se valida con `context.auth` (rechazar si no existe).
- **Secrets**: con v1, `functions.config()` (`firebase functions:config:set servicio.api_key="..."`). Está deprecado pero funciona; la alternativa moderna (`defineSecret`) es de v2 y trae de vuelta el problema de Cloud Run. NUNCA secrets en `.env` ni en código.

### Por qué v1 y no v2

Functions v2 corre sobre **Cloud Run**, y para que el navegador pueda invocar una función hace falta un binding IAM público (`allUsers` con rol invoker). El proyecto GCP tiene una **org policy que prohíbe otorgar acceso público**, así que una v2 desplegada no se puede invocar desde el browser — ni siquiera pasando `invoker: "public"`. v1 corre sobre la infra clásica de Cloud Functions, donde los triggers HTTPS son públicos por defecto y no necesitan ese binding.

Que el endpoint sea públicamente *invocable* no lo deja abierto: la autenticación real sigue siendo el `context.auth` que valida el ID token de Firebase Auth. Sin token válido, la función rechaza.

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

### Problemas conocidos al deployar

**1. "Failed to parse build specification" / timeout en el análisis.** La CLI le da 10s al paso de discovery y en esta máquina no alcanza. Subir el límite:

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
```

**2. "Cannot set CPU on the functions ping because they are GCF gen 1".** Firebase **no puede convertir una función desplegada de gen 2 a gen 1 en el lugar**. Si en el proyecto quedó viva una versión v2 de `ping` (es el caso hoy), hay que borrarla antes de desplegar la v1:

```bash
firebase functions:delete ping --region southamerica-west1 --force
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
```

Hay una ventana de unos segundos sin función entre el borrado y el deploy — irrelevante para `ping`, pero hay que tenerlo en cuenta si algún día pasa con una función en uso.

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

Patrón para una callable que llama a un servicio externo con una API key. Mismo estilo que `ping`: v1, región explícita, `context.auth` validado.

```js
import * as functionsV1 from "firebase-functions/v1";

const { HttpsError } = functionsV1.https;

export const miFuncion = functionsV1
  .region("southamerica-west1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    // validar `data` acá antes de usarlo
    const apiKey = functionsV1.config().servicio?.api_key;
    if (!apiKey) throw new HttpsError("failed-precondition", "Falta config servicio.api_key");
    const res = await fetch("https://servicio-externo/...", {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) throw new HttpsError("internal", "Upstream error");
    return await res.json();
  });
```

La key se setea una vez con `firebase functions:config:set servicio.api_key="..."` y después hay que redeployar para que la función la vea.
