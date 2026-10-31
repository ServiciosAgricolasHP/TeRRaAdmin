# Usuarios / Users

- Pantalla: `src/screens/Users.jsx`. Ruta `/admin/users` (solo admin). Colección `users`.
- Piezas, en `screens/users/`: `UserCard` (la tarjeta de cada cuenta, con su último cambio), `useLastChanges` (el último registro de auditoría de cada cuenta), `NewAccountModal`, `GreetingsModal`, `BirthdayModal` con `BirthdayField`, y `helpers.js` (`nameOf`, `errorMessage`).
- Lista los perfiles (1 lectura por perfil) con correo, alias, rol, estado, "Visto por última vez" y "Último cambio". El correo y la hora de la visita los escribe cada cuenta desde la app (ver Auth en AGENTS.md): un perfil de alguien que todavía no entra sale "Sin correo todavía".
- **Último cambio** es el último registro de auditoría de la cuenta, con su entidad ("hace 3 h · Jornada") y, al pasar el mouse, la acción y la hora exacta. Cuesta 1 lectura por cuenta (`logs` por `uid`, `timestamp` descendente, `limit 1`) y necesita el índice compuesto `uid ↑ + timestamp ↓`: si falta, la pantalla lo avisa con el enlace para crearlo. No ve a quien solo miró sin modificar nada; eso lo dice "Visto por última vez".
- Acciones por cuenta: **Hacer admin / Quitar admin**, **Suspender / Reactivar** (`disabled`), **Contraseña** (el correo de Firebase para elegir una nueva, en español), **Saludos** (ver Saludos personalizados, abajo) y **Cumpleaños** (`screens/users/BirthdayModal.jsx`).
- **Cumpleaños** (`birthday`, `"MM-DD"` sin año): lo carga solo un admin, desde Usuarios, y la tarjeta lo muestra; la persona no lo edita en Mi perfil. Las reglas aceptan `"MM-DD"` o vacío, y solo de un admin. El día y el mes se eligen en `screens/users/BirthdayField.jsx`, que no deja una fecha que no existe. Lo usa la pantalla de carga, desde la próxima vez que esa cuenta abre la app.
- **Límites**, los mismos en `firestore.rules` y en `utils/userAccounts.js`, con tests en los dos lados:
  - Nadie cambia su propio rol ni suspende su propia cuenta. Por eso siempre queda al menos un admin: el que actúa no puede quitarse el rol.
  - Un admin no se suspende: primero se le quita el rol.
  - Una cuenta suspendida no pasa a admin: primero se reactiva.
- El rol y la suspensión pasan por `usersService.update`, así que quedan en la auditoría.
- **+ Nueva cuenta** usa el job `createUser` (Cloud Functions): crea la cuenta en Authentication con una contraseña al azar que no se guarda, y el perfil con el mismo UID, y lo registra en la auditoría. Después la app envía el correo para elegir contraseña (opción marcada por defecto).
  - Si el correo ya tiene cuenta (por ejemplo, de la app Calendario), la función responde `errorCode: "account-exists"` y la pantalla pide confirmación antes de darle acceso a esa cuenta (`params.useExisting`): quien conozca su contraseña va a poder entrar.
  - La función vuelve a comprobar que quien pide sea admin, leyendo su perfil, además de la regla de `functionJobs`.
  - Listar las cuentas de Authentication sin perfil, y desactivar o borrar una cuenta, están como TODO en `functions/index.js`.

## Saludos personalizados

- `utils/greetings.js` — `GREETING_SLOTS` (los nombres de las ranuras) y `greeting(user, slot, fallback)`.
- **El texto nunca va en el código.** Vive en `users/{uid}.greetings[slot]`, se carga desde Usuarios → Saludos, y cada usuario solo lee el suyo. Hardcodearlo deja el mail de una persona real en el repo, y fuera de contexto un chiste interno puede leerse como cualquier otra cosa.
- Cuesta **0 lecturas**: el doc ya viene con el perfil. No hay colección aparte ni consulta al abrir el modal.
- Un texto vacío o en blanco cuenta como "sin saludo" — borrar el easter egg es vaciar el campo, no eliminarlo del documento.
- Ranuras en uso: `workerAlreadyInLabor` (tag del trabajador ya agregado, en `WorkerPickerModal`), `profileHover` (tooltip del nombre en el header), `notFound` (la 404) y `removeDayBlocked` (línea extra al final del aviso que impide quitar un día del ciclo, por jornadas o por vueltas de transporte). Para sumar otra: declararla en `GREETING_SLOTS` y describirla en `GREETING_FIELDS` (el editor de Usuarios), leerla con `greeting()` donde toque, y cargar el texto desde Usuarios.
