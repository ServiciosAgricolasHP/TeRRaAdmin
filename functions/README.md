# Cloud Functions — TeRRaAdmin

Backend de `arandanos-hp`. **No se invoca por HTTP**: se le escribe un documento
en la colección `functionJobs` y un trigger de Firestore lo levanta, lo ejecuta y
escribe el resultado en el mismo documento. La UI mira ese documento con un
listener.

Hoy hay un solo tipo de job, `ping`, que verifica el plomo de punta a punta. El
backup en JSON es el siguiente (ver el TODO al final de `index.js`).

## Por qué un trigger y no un callable

Las tres variantes de callable están cerradas en este proyecto, y conviene
saberlo antes de volver a intentarlas:

| Intento | Qué pasa |
|---|---|
| **Callable v2** | Corre sobre Cloud Run y necesita un binding IAM `allUsers` para que el navegador la invoque. La org policy del proyecto GCP prohíbe acceso público → **403 con cuerpo HTML** antes de llegar al código. El SDK recibe HTML donde espera JSON y reporta un error engañoso. Verificado con `curl` contra el endpoint desplegado. |
| **Callable v1** | Cloud Functions **1ª gen no existe en `southamerica-west1`**: Santiago no está entre sus 23 regiones. Encima esa región tampoco soporta App Engine, que gen1 necesita para el bucket de staging. El deploy falla con un 403 sobre `locations/southamerica-west1` que termina en *"or it may not exist"* — hay que leerlo por esa segunda mitad, no por la primera. |
| **Trigger de Firestore v1** | Solo dispara sobre la base `(default)`, y este proyecto tiene una sola base y se llama `hpdatabase`. |

Lo que sí funciona: **trigger de Firestore en v2**. Eventarc lo invoca con una
service account, así que no necesita el invoker público que la org policy
bloquea. Es el único camino que no pelea contra una restricción de plataforma.

De yapa, el patrón da cosas que un callable no: el progreso de un job largo es un
campo más del documento que la UI ya está mirando, y el job queda registrado.

## Región y base — no tocar sin leer esto

- **Base**: `hpdatabase`. **No** es `(default)`; de hecho `(default)` no existe en
  este proyecto. El trigger lo declara con `database: "hpdatabase"`. Si eso no
  coincide, la función queda suscrita a una base inexistente y **nunca dispara,
  sin dar error**. Es el peor modo de falla que tiene este diseño.
- **Región**: `us-central1`. No es una preferencia: `hpdatabase` está en
  **`nam5`**, el multi-región de Estados Unidos, y un trigger de Firestore tiene
  que vivir en la ubicación de la base (`nam5` = us-central1 + us-central2).

  Vale la pena decirlo claro porque el código anterior apuntaba a Santiago: **los
  datos nunca estuvieron en Chile**. Poner la función en `southamerica-west1` no
  habría acercado nada — habría alejado la función de la base. Acá queda pegada a
  los datos, que es lo que importa cuando lee decenas de miles de documentos.

## La autorización se mudó a las reglas

Con un callable el portero era `context.auth` **dentro** de la función. Acá el
portero es la regla de Firestore que decide quién puede crear un documento en
`functionJobs` — o sea el mismo lugar donde ya vive la autorización del resto de
la app. La función confía en que si el documento existe, alguien con permiso lo
creó.

**Las reglas viven solo en la consola de Firebase** (no hay `firestore.rules` en
el repo, a propósito — ver AGENTS.md → Tests), así que este permiso hay que
cargarlo a mano. Sin esto el botón de la Consola falla con `permission-denied`:

```js
match /functionJobs/{jobId} {
  // Encolar trabajo del backend es una acción de admin.
  allow create: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
    && request.resource.data.status == "pending"
    && request.resource.data.requestedBy == request.auth.uid;

  // Hace falta para que la UI vea el resultado.
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";

  // La función escribe con el admin SDK, que no pasa por reglas. Nadie desde
  // el cliente puede cambiarle el estado a un job ni borrar el registro.
  allow update, delete: if false;
}
```

Dos detalles de esa regla que no son adorno:

- **`status == "pending"` en el `create`** evita que un cliente cree un job ya
  marcado como `done` y así se saltee la ejecución, o lo cree en `running` para
  que la función lo descarte por el reclamo transaccional.
- **`requestedBy == request.auth.uid`** hace que nadie pueda encolar un job a
  nombre de otro. El campo es lo que queda en el registro de quién lo pidió.

El `get()` del doc de `users` cuesta una lectura por evaluación. Si las reglas ya
tienen un helper de admin, usar ese en vez de repetir el `get()`.

## Convenciones

- **Runtime**: Node 20.
- **Versión de Functions**: **v2** (`firebase-functions/v2`).
- **Un job nuevo** es una entrada más en el objeto `handlers` de `index.js`: una
  función `async` que recibe el job y devuelve lo que va al campo `result`. Si
  lanza, el job queda en `error` con el mensaje. No hay que tocar el trigger.
- **Entrega al menos una vez**: Eventarc puede entregar el mismo evento dos
  veces. El job se reclama con una transacción antes de ejecutarse — eso es lo
  que separa "un backup" de "dos backups". No sacar ese bloque.
- **`retry: false`** a propósito: un job que falló se vuelve a pedir a mano.
  Reintentar solo es seguro cuando la operación es idempotente, y eso se decide
  por handler.
- **Secrets**: `defineSecret` de v2 (`firebase functions:secrets:set SERVICIO_API_KEY`).
  Ahora que estamos en v2 esto es el camino normal y no hay que usar
  `functions.config()`, que está deprecado. NUNCA secrets en `.env` ni en código.

## Prerequisitos para deployar

1. **Plan Blaze (pay-as-you-go)** activo. Cloud Functions no funciona en Spark.
2. **Firebase CLI** instalado y logueado: `npm i -g firebase-tools` + `firebase login`.
3. **APIs habilitadas** en GCP (las activa el primer deploy): Cloud Functions,
   Cloud Build, Artifact Registry, Cloud Run, **Eventarc** y **Pub/Sub** — las dos
   últimas son nuevas respecto de v1 y son las que hacen andar el trigger.

## Setup local

```bash
cd functions
npm install
```

## Verificación local (antes de deployar)

```bash
npm run functions:verify     # desde la raíz del repo
```

Levanta los emuladores de **functions + firestore** con el project id
`demo-terra-test` y corre `functions/verify.mjs`, que encola jobs y espera el
resultado igual que lo hace la Consola. Sale con código ≠ 0 si algo falla.

Existe porque iterar deployando es caro: cada corrida pasa por Cloud Build, tarda
minutos y factura. El prefijo `demo-` es la misma barrera que usan los tests e2e
— el SDK nunca contacta servidores de Google, así que no hay forma de tocar
`arandanos-hp` desde acá.

**Un job nuevo no se deploya sin sumarle sus chequeos a `verify.mjs`.**

> **Lo que la verificación local NO puede probar**: que el trigger esté suscrito a
> la base correcta. El emulador de Firestore todavía no soporta bases múltiples
> —lo avisa al arrancar— así que sirve una sola y el nombre le da igual. Eso
> solo se prueba en producción, y es exactamente lo que hace el botón de ping.

## Deploy

> Correr **`npm run functions:verify` primero**. Si falla, no deployar.

Deploy manual, fuera del pipeline de GitHub Actions (el CI/CD del repo solo cubre
el frontend). Automatizarlo requeriría guardar credenciales de Firebase como
secret en GitHub.

Desde la raíz del repo:

```powershell
# PowerShell — es la consola por defecto en esta máquina
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
firebase deploy --only functions
```

```bash
# Git Bash / WSL
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
```

PowerShell **no** entiende el prefijo `VAR=valor comando`: lo lee como el nombre
de un ejecutable y falla con `CommandNotFoundException`. El límite de discovery
solo hace falta para `deploy` — el emulador descubre las funciones sin él.

### Después del primer deploy

1. Cargar la regla de `functionJobs` en la consola (arriba). Sin eso el botón
   falla con `permission-denied`.
2. Ir a **Consola admin → 🧪 Ping al backend** y apretar el botón. Ese es el
   chequeo que la verificación local no puede hacer: prueba que el trigger esté
   realmente suscrito a `hpdatabase`.

El primer deploy puede tardar varios minutos: además de compilar, habilita
Eventarc y Pub/Sub y crea el trigger.

### Problemas conocidos

**"Failed to parse build specification" / timeout en el análisis.** La CLI le da
10 s al paso de discovery y en esta máquina no alcanza. Ver el
`FUNCTIONS_DISCOVERY_TIMEOUT` de arriba.

**Quedan funciones viejas dando vueltas.** `firebase functions:list` muestra qué
hay desplegado. Para borrar una:

```bash
firebase functions:delete <nombre> --region <región> --force
```

Ojo: cuando el proyecto queda **sin ninguna función**, `firebase-tools` tira
`Error: An unexpected error has occurred` — es un bug de la CLI armando un
backend vacío, no una falla del borrado. Confirmar con `functions:list` antes de
salir a buscar el problema.

**El ping expira a los 45 s.** O la función no está desplegada, o su trigger
quedó apuntado a otra base. `firebase functions:log` dice si llegó a correr: si
no hay ni una línea, el evento nunca le llegó.

## Logs

```bash
firebase functions:log
firebase functions:log --only runFunctionJob
```

## Agregar un job nuevo

Una entrada más en `handlers`. No se toca el trigger, ni la región, ni la UI que
espera el resultado.

```js
const handlers = {
  async ping(job) { /* ... */ },

  async miJob(job) {
    // `job` es el documento tal como lo creó el cliente. Validar `job.params`
    // acá antes de usarlo: lo escribió el navegador, no la función.
    const apiKey = process.env.SERVICIO_API_KEY;
    const res = await fetch("https://servicio-externo/...", {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) throw new Error("Upstream respondió " + res.status);
    return await res.json();   // esto es lo que va al campo `result`
  },
};
```

Del lado del cliente, encolarlo es un `addDoc` a `functionJobs` con
`{ type: "miJob", status: "pending", requestedBy, params }` y un `onSnapshot`
sobre el documento que devuelve. `PingSection` en `src/screens/AdminConsole.jsx`
es el ejemplo completo, con los tres modos de falla separados.
