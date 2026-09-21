import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getCountFromServer, getDocs, doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { faenasService, cyclesService, workersService, usersService } from "../services";
import { advancesService } from "../services/advancesService";
import { toProperName } from "../utils/nameUtils";
import { GREETING_SLOTS } from "../utils/greetings";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmDialog from "../components/ConfirmDialog";

// Módulo de consola admin. Sirve para inspeccionar la escala de los datos
// antes de tomar decisiones de costo (snapshots, paginación, etc.). Todas
// las consultas usan `getCountFromServer` que cuesta ~1 read por cada 1000
// docs contados — barato a propósito.
//
// Nada se ejecuta solo: cada botón dispara su query individual y mostramos
// el costo estimado al lado. Si alguna query devuelve mucho, el contador
// real puede ser >1.

// Todas las colecciones que usa la app, agrupadas por área. La lista estaba
// a mano y se había quedado en 12 de 28: faltaba `dteDocuments`, que es la
// segunda más grande del sistema, y familias enteras como el libro de precios
// o los pesajes QR.
const MAIN_COLLECTIONS = [
  // Producción
  { id: "workdays", group: "Producción", label: "Workdays", note: "jornadas registradas (la tabla más grande)" },
  { id: "cycles", group: "Producción", label: "Ciclos", note: "abiertos y cerrados" },
  { id: "faenas", group: "Producción", label: "Faenas", note: "" },
  { id: "subfaenas", group: "Producción", label: "Subfaenas", note: "" },
  { id: "cycleSummaries", group: "Producción", label: "Resúmenes de ciclo", note: "tarifas de cobro y títulos, 1 por ciclo configurado" },
  { id: "catalogs", group: "Producción", label: "Catálogos", note: "calidades, envases, tipos de trato" },
  { id: "laborGroups", group: "Producción", label: "Grupos de labor", note: "" },

  // Personas y pagos
  { id: "worker", group: "Personas y pagos", label: "Trabajadores", note: "doc id = RUT" },
  { id: "groupLeader", group: "Personas y pagos", label: "Líderes de grupo", note: "lista curada" },
  { id: "payrolls", group: "Personas y pagos", label: "Nóminas", note: "" },
  { id: "payrollSnapshots", group: "Personas y pagos", label: "Snapshots de nómina", note: "1:1 con payrolls" },
  { id: "advances", group: "Personas y pagos", label: "Anticipos / Bonos", note: "" },

  // Transporte
  { id: "transports", group: "Transporte", label: "Vueltas", note: "" },
  { id: "transportPayments", group: "Transporte", label: "Resúmenes", note: "" },
  { id: "transportPayrolls", group: "Transporte", label: "Quincenas", note: "agrupan resúmenes" },
  { id: "carriers", group: "Transporte", label: "Transportistas", note: "" },

  // Facturación
  { id: "dteDocuments", group: "Facturación", label: "Documentos DTE", note: "la segunda más grande; mezcla empresas y períodos" },
  { id: "companies", group: "Facturación", label: "Empresas", note: "" },
  { id: "costCenters", group: "Facturación", label: "Centros de costo", note: "" },
  { id: "informalExpenses", group: "Facturación", label: "Gastos informales", note: "" },

  // Otros registros
  { id: "priceBookEntries", group: "Otros registros", label: "Libro de precios", note: "" },
  { id: "priceBookConfig", group: "Otros registros", label: "Config del libro de precios", note: "normalmente 1 doc" },
  { id: "contactCards", group: "Otros registros", label: "Información y cuentas", note: "" },
  { id: "interestLinks", group: "Otros registros", label: "Links útiles", note: "" },
  { id: "indicators", group: "Otros registros", label: "Indicadores", note: "" },
  { id: "harvestWeights", group: "Otros registros", label: "Pesajes QR", note: "la escribe la app de scan, acá solo se lee" },
  { id: "qrPrefixes", group: "Otros registros", label: "Prefijos QR", note: "1 por código físico" },

  // Sistema
  { id: "users", group: "Sistema", label: "Perfiles de usuario", note: "doc id = uid de Firebase" },
  { id: "logs", group: "Sistema", label: "Logs de auditoría", note: "puede ser MUY grande" },
];

// Orden de los grupos en la tabla, para que no dependa del orden del array.
const COLLECTION_GROUPS = [...new Set(MAIN_COLLECTIONS.map((c) => c.group))];

// Ranuras de saludo, con una descripción de dónde aparece cada una. El texto
// vive en `users/{uid}.greetings`, nunca en el código — ver utils/greetings.js.
const GREETING_FIELDS = [
  {
    slot: GREETING_SLOTS.workerAlreadyInLabor,
    label: "Trabajador ya en la labor",
    note: 'Tag gris al intentar agregar a alguien que ya está. Default: "Ya en la labor".',
  },
  {
    slot: GREETING_SLOTS.profileHover,
    label: "Hover del nombre en el header",
    note: 'Tooltip al pasar el mouse sobre el propio nombre. Default: "Mi perfil".',
  },
  {
    slot: GREETING_SLOTS.notFound,
    label: "Página no encontrada (404)",
    note: "Línea suelta bajo el mensaje de error. Sin saludo no aparece nada.",
  },
];

const monthRange = (y, m) => {
  // m: 1..12
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
};

const fmtNumber = (n) => new Intl.NumberFormat("es-CL").format(Number(n) || 0);

async function countCollection(collName) {
  const snap = await getCountFromServer(collection(db, collName));
  return snap.data().count;
}

async function countWorkdaysInRange(from, to) {
  const q = query(
    collection(db, "workdays"),
    where("date", ">=", from),
    where("date", "<=", to),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

async function countWorkdaysByCycle(cycleId) {
  const q = query(collection(db, "workdays"), where("cycleId", "==", cycleId));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// Tarjeta colapsable. La consola junta diagnostico, inspeccion y migraciones
// de una sola vez: desplegadas todas a la vez es un muro, y lo que se usa en
// una visita suele ser una sola. El estado se recuerda por tarjeta.
function Grupo({ titulo, children }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {titulo}
      </h2>
      {children}
    </div>
  );
}

function ConsoleCard({ id, title, description, actions, children }) {
  const clave = `af.console.${id}`;
  const [abierta, setAbierta] = useState(() => {
    try { return localStorage.getItem(clave) === "1"; } catch { return false; }
  });

  const alternar = () => {
    setAbierta((v) => {
      try { localStorage.setItem(clave, v ? "0" : "1"); } catch { /* noop */ }
      return !v;
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        className="flex w-full items-baseline gap-3 p-4 text-left hover:bg-[var(--color-accent-soft)]"
      >
        <span className="text-xs text-[var(--color-muted)]">{abierta ? "\u25BE" : "\u25B8"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{description}</span>
          ) : null}
        </span>
      </button>

      {abierta ? (
        <div className="border-t border-[var(--color-border)] p-4">
          {actions ? <div className="mb-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function AdminConsole() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consola admin</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Inspección de escala. Cada botón dispara una consulta de recuento
          (~1 lectura por 1000 docs). No se ejecuta nada hasta que lo dispares.
        </p>
      </div>

      <Grupo titulo="Diagnóstico">
        <AuthDebugSection />
        <PingSection />
        <GreetingsSection />
      </Grupo>

      <Grupo titulo="Inspección de escala">
        <CollectionCountsSection />
        <WorkdaysByMonthSection />
        <WorkdaysByRangeSection />
        <WorkdaysByCycleSection />
      </Grupo>

      {/* Se corren una vez y se borran. Van juntas para que se vea de un
          vistazo qué queda pendiente de migrar. */}
      <Grupo titulo="Migraciones únicas">
        <NormalizeWorkerNamesSection />
        <BackfillWorkerRutFieldSection />
        <BackfillWorkdayLogMetaSection />
        <MigrateAdvanceRutsSection />
      </Grupo>
    </div>
  );
}

// ============================================================
// Sección Debug: ping a Cloud Functions
// ============================================================
// Verifica el plomo de Firebase Functions (auth + región) llamando al callable
// `ping`. Vivía en el Dashboard como bloque temporal; se movió acá, que es
// donde viven las herramientas de diagnóstico. El deploy de esa función sigue
// pendiente (ver functions/README.md), así que mientras tanto va a fallar con
// `not-found` — eso también es información útil.
function PingSection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const runPing = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await httpsCallable(functions, "ping")();
      setResult({ ok: true, data });
    } catch (err) {
      setResult({ ok: false, code: err.code, message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleCard id="ping-a-cloud-functions" title="🧪 Ping a Cloud Functions">
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Llama al callable <code>ping</code> para verificar auth y región.
      </p>
      <button
        onClick={runPing}
        disabled={busy}
        className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-sm text-[var(--color-warning)] hover:opacity-80 disabled:opacity-60"
      >
        {busy ? "Llamando..." : "Probar ping"}
      </button>
      {result && (
        <div
          className={`mt-3 rounded-md border p-3 font-mono text-xs ${
            result.ok
              ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
              : "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          }`}
        >
          {result.ok
            ? `✓ OK — ${JSON.stringify(result.data)}`
            : `✗ ${result.code || "error"}: ${result.message}`}
        </div>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Sección Debug: por qué no soy admin
// ============================================================
// Muestra qué le llega al AuthContext (uid, email, role calculado) y qué
// contiene realmente el doc `users/{uid}` en Firestore. Sirve para diagnosticar
// por qué `isAdmin === false` cuando el usuario cree que debería ser true.
//
// Casos típicos:
//   1. El doc `users/{uid}` NO existe → AuthContext cae a role: "supervisor".
//      Fix: crear el doc en Firestore Console con { role: "admin" }.
//   2. El doc existe pero `role !== "admin"` (ej: "ADMIN" en mayúsculas,
//      "administrador", o el campo se llama `rol` en vez de `role`).
//   3. La security rule bloquea el read → error visible acá, y el AuthContext
//      cae al catch → role: "supervisor". Fix: rule tipo
//      `match /users/{uid} { allow read: if request.auth.uid == uid; }`.
function AuthDebugSection() {
  const { user, isAdmin } = useAuth();
  const [docState, setDocState] = useState({ loading: true });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setDocState({ loading: true });
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          setDocState({ loading: false, exists: false });
        } else {
          setDocState({ loading: false, exists: true, data: snap.data() });
        }
      } catch (err) {
        setDocState({ loading: false, error: err.message || String(err), code: err.code });
      }
    })();
  }, [user?.uid]);

  const copyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <ConsoleCard id="debug-de-rol-admin" title="🕵️ Debug de rol admin">
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        El AuthContext lee <code>users/{"{uid}"}</code> y toma el campo <code>role</code>.
        Si dice <code>"admin"</code> exactamente, activa el flag.
      </p>

      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Sesión actual
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-[80px_1fr]">
            <div className="text-[var(--color-muted)]">Email:</div>
            <div className="font-mono">{user?.email || "(sin sesión)"}</div>
            <div className="text-[var(--color-muted)]">UID:</div>
            <div className="flex items-center gap-2">
              <code className="break-all font-mono text-xs">{user?.uid || "—"}</code>
              {user?.uid && (
                <button
                  type="button"
                  onClick={copyUid}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
                >
                  {copied ? "✓ Copiado" : "📋 Copiar"}
                </button>
              )}
            </div>
            <div className="text-[var(--color-muted)]">Role visto por AuthContext:</div>
            <div>
              <code className="font-mono">{user?.role || "(ninguno)"}</code>
            </div>
            <div className="text-[var(--color-muted)]">isAdmin:</div>
            <div>
              <span className={isAdmin ? "font-semibold text-[var(--color-success)]" : "font-semibold text-[var(--color-danger)]"}>
                {isAdmin ? "✓ TRUE" : "✗ FALSE"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Firestore <code>users/{user?.uid || "—"}</code>
          </div>
          {docState.loading ? (
            <div className="text-xs text-[var(--color-muted)]">Consultando…</div>
          ) : docState.error ? (
            <>
              <div className="text-xs text-[var(--color-danger)]">
                ✖ Error al leer: <code>{docState.code || "?"}</code>
              </div>
              <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                {docState.error}
              </div>
              <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px]">
                <strong>Probable causa:</strong> las security rules de Firestore
                bloquean el read. Necesitás una rule tipo:
                <pre className="mt-1 overflow-auto text-[10px]">{`match /users/{uid} {
  allow read: if request.auth.uid == uid;
}`}</pre>
              </div>
            </>
          ) : !docState.exists ? (
            <>
              <div className="text-xs text-[var(--color-danger)]">
                ✖ El doc <code>users/{user?.uid}</code> NO existe.
              </div>
              <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px]">
                <strong>Fix</strong>: en Firestore Console, crear el doc con id{" "}
                <code>{user?.uid}</code> en la colección <code>users</code> y
                agregar el campo <code>role</code> (string) con valor{" "}
                <code>"admin"</code> exactamente en minúscula. Después
                relogueate en la app.
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[var(--color-success)]">
                ✓ Existe. Contenido:
              </div>
              <pre className="mt-1 overflow-auto rounded bg-[var(--color-surface)] p-2 text-[10px]">
                {JSON.stringify(docState.data, null, 2)}
              </pre>
              {docState.data?.role !== "admin" && (
                <div className="mt-2 rounded bg-[var(--color-surface)] p-2 text-[10px] text-[var(--color-danger)]">
                  El campo <code>role</code> es <code>{JSON.stringify(docState.data?.role)}</code>,
                  no <code>"admin"</code>. Corregí a exactamente{" "}
                  <code>"admin"</code> en minúsculas y relogueate.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ConsoleCard>
  );
}

// ============================================================
// Sección 1: counts de todas las colecciones principales
// ============================================================
function CollectionCountsSection() {
  const [results, setResults] = useState({}); // id → { count?, error?, busy? }
  const [runningAll, setRunningAll] = useState(false);

  const runOne = async (id) => {
    setResults((r) => ({ ...r, [id]: { busy: true } }));
    try {
      const count = await countCollection(id);
      setResults((r) => ({ ...r, [id]: { count } }));
    } catch (err) {
      setResults((r) => ({ ...r, [id]: { error: err.message || String(err) } }));
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    try {
      for (const c of MAIN_COLLECTIONS) {
        await runOne(c.id);
      }
    } finally {
      setRunningAll(false);
    }
  };

  const totalRuns = Object.values(results).filter((r) => r.count != null).length;
  const [copiado, setCopiado] = useState(false);

  // Texto plano con las colecciones ya contadas, para pegar en un mensaje o
  // una planilla. Solo las que tienen número: una lista con guiones no dice
  // nada y se confunde con "colección vacía".
  const copiarConteos = async () => {
    const lineas = [];
    let total = 0;
    for (const g of COLLECTION_GROUPS) {
      const delGrupo = MAIN_COLLECTIONS.filter(
        (c) => c.group === g && results[c.id]?.count != null,
      );
      if (delGrupo.length === 0) continue;
      lineas.push(`${g}`);
      for (const c of delGrupo) {
        const n = results[c.id].count;
        total += n;
        lineas.push(`  ${c.id}\t${n}`);
      }
    }
    if (lineas.length === 0) return;
    lineas.push("", `TOTAL\t${total}`);
    const texto = lineas.join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o contexto no seguro): que al menos se
      // pueda seleccionar a mano.
      window.prompt("Copiá los conteos:", texto);
    }
  };

  return (
    <ConsoleCard id="counts-por-coleccion" title="Counts por colección" 
      description={<>~1 lectura por colección (Firestore aggregation).</>} 
      actions={<><button
          type="button"
          onClick={runAll}
          disabled={runningAll}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {runningAll ? "Ejecutando…" : `▶ Contar todas (~${MAIN_COLLECTIONS.length} reads)`}
        </button>
        <button
          type="button"
          onClick={copiarConteos}
          disabled={totalRuns === 0}
          title={totalRuns === 0 ? "Primero contá alguna colección" : `Copiar ${totalRuns} conteos`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          {copiado ? "✓ Copiado" : `📋 Copiar${totalRuns ? ` (${totalRuns})` : ""}`}
        </button></>}>
      <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Colección</th>
              <th className="px-3 py-2 text-right">Documentos</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {COLLECTION_GROUPS.flatMap((g) => [
              <tr key={`g-${g}`} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <td colSpan={3} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {g}
                </td>
              </tr>,
              ...MAIN_COLLECTIONS.filter((c) => c.group === g).map((c) => {
              const r = results[c.id] || {};
              return (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{c.id}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">
                      {c.label}
                      {c.note ? ` · ${c.note}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.busy ? (
                      <span className="text-[var(--color-muted)]">…</span>
                    ) : r.error ? (
                      <span className="text-[var(--color-danger)]">err</span>
                    ) : r.count != null ? (
                      <span className="font-semibold">{fmtNumber(r.count)}</span>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => runOne(c.id)}
                      disabled={r.busy}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      Contar
                    </button>
                  </td>
                </tr>
              );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {totalRuns > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          {totalRuns} consulta{totalRuns === 1 ? "" : "s"} ejecutada{totalRuns === 1 ? "" : "s"}.
        </p>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Sección 2: workdays por mes del año seleccionado
// ============================================================
function WorkdaysByMonthSection() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState([]); // [{ month, start, end, count, busy, error }]
  const [running, setRunning] = useState(false);

  const months = useMemo(
    () => [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ],
    [],
  );

  const reset = () => {
    setRows(
      Array.from({ length: 12 }, (_, i) => {
        const { start, end } = monthRange(year, i + 1);
        return { month: i + 1, start, end, count: null };
      }),
    );
  };

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const runYear = async () => {
    setRunning(true);
    try {
      for (let i = 0; i < 12; i++) {
        const { start, end } = monthRange(year, i + 1);
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, busy: true } : r)));
        try {
          const count = await countWorkdaysInRange(start, end);
          setRows((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, count, busy: false } : r)),
          );
        } catch (err) {
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, error: err.message || String(err), busy: false } : r,
            ),
          );
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const totalRuns = rows.filter((r) => r.count != null).length;

  return (
    <ConsoleCard id="workdays-por-mes" title="Workdays por mes" 
      description={<>12 consultas, ~12 reads totales. Útil para ver estacionalidad.</>} 
      actions={<><div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Año</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || currentYear)}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={runYear}
            disabled={running}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running ? "Ejecutando…" : "▶ Contar año (~12 reads)"}
          </button>
        </div></>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rows.map((r, i) => (
          <div
            key={r.month}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              {months[i]} {year}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {r.busy ? "…" : r.error ? "err" : r.count != null ? fmtNumber(r.count) : "—"}
            </div>
          </div>
        ))}
      </div>
      {totalRuns > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Total año:{" "}
          <span className="font-semibold tabular-nums text-[var(--color-text)]">
            {fmtNumber(total)}
          </span>{" "}
          workdays
        </p>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Sección 3: workdays por rango custom
// ============================================================
function WorkdaysByRangeSection() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!from || !to) {
      setError("Completá ambas fechas");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const c = await countWorkdaysInRange(from, to);
      setCount(c);
    } catch (err) {
      setError(err.message || String(err));
      setCount(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleCard id="workdays-por-rango-custom" title="Workdays por rango custom">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Desde</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
        />
        <label className="text-xs text-[var(--color-muted)]">Hasta</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {busy ? "Ejecutando…" : "▶ Contar (~1 read)"}
        </button>
        {count != null && (
          <span className="ml-auto text-sm">
            <span className="text-[var(--color-muted)]">Resultado: </span>
            <span className="font-semibold tabular-nums">{fmtNumber(count)}</span>{" "}
            workdays
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Sección 4: workdays por ciclo activo
// ============================================================
function WorkdaysByCycleSection() {
  const [cycles, setCycles] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({}); // cycleId → count | "err" | "..."
  const [includeClosed, setIncludeClosed] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, f] = await Promise.all([
          cyclesService.list({ cache: true, ttl: 60_000 }),
          faenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        ]);
        setCycles(c);
        setFaenas(f);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleCycles = useMemo(() => {
    const list = includeClosed ? cycles : cycles.filter((c) => c.status !== "closed");
    const faenaName = (id) => faenas.find((f) => f.id === id)?.name || "—";
    return list
      .map((c) => ({ ...c, faenaName: faenaName(c.faenaId) }))
      .sort((a, b) =>
        String(a.faenaName).localeCompare(b.faenaName) ||
        String(a.label || "").localeCompare(b.label || ""),
      );
  }, [cycles, faenas, includeClosed]);

  const runAll = async () => {
    setRunning(true);
    try {
      for (const c of visibleCycles) {
        setCounts((prev) => ({ ...prev, [c.id]: "..." }));
        try {
          const n = await countWorkdaysByCycle(c.id);
          setCounts((prev) => ({ ...prev, [c.id]: n }));
        } catch {
          setCounts((prev) => ({ ...prev, [c.id]: "err" }));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const numericCounts = Object.values(counts).filter((v) => typeof v === "number");
  const total = numericCounts.reduce((s, n) => s + n, 0);

  return (
    <ConsoleCard id="workdays-por-ciclo" title="Workdays por ciclo" 
      description={<>1 lectura por ciclo. Útil para ver dónde está concentrada la data.</>} 
      actions={<><div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
            />
            incluir cerrados
          </label>
          <button
            type="button"
            onClick={runAll}
            disabled={running || loading || visibleCycles.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? "Ejecutando…"
              : `▶ Contar ${visibleCycles.length} ciclo${visibleCycles.length === 1 ? "" : "s"} (~${visibleCycles.length} reads)`}
          </button>
        </div></>}>

      {loading ? (
        <p className="text-xs text-[var(--color-muted)]">Cargando ciclos…</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Faena</th>
                <th className="px-3 py-2">Ciclo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Workdays</th>
              </tr>
            </thead>
            <tbody>
              {visibleCycles.map((c) => {
                const v = counts[c.id];
                return (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-1.5 text-xs text-[var(--color-muted)]">{c.faenaName}</td>
                    <td className="px-3 py-1.5">{c.label}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {c.status === "closed" ? (
                        <span className="text-[var(--color-muted)]">cerrado</span>
                      ) : (
                        <span className="text-[var(--color-accent)]">abierto</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {v === "..." ? (
                        <span className="text-[var(--color-muted)]">…</span>
                      ) : v === "err" ? (
                        <span className="text-[var(--color-danger)]">err</span>
                      ) : typeof v === "number" ? (
                        <span className="font-semibold">{fmtNumber(v)}</span>
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {numericCounts.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Suma de los {numericCounts.length} ciclo
          {numericCounts.length === 1 ? "" : "s"} contados:{" "}
          <span className="font-semibold tabular-nums text-[var(--color-text)]">
            {fmtNumber(total)}
          </span>{" "}
          workdays
        </p>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Sección 5: normalizar nombres de trabajadores a Proper Case
// ============================================================
// Aplica `toProperName` a todos los `worker.name` que difieran del formato
// esperado ("Juan Pérez", "Juan de la Cruz"). Flujo en 2 pasos: primero un
// preview que lista los cambios propuestos (leer no escribe), y después el
// botón de aplicar corre updates uno-a-uno con progreso.
//
// El costo es 1 read por worker (list completo — no cacheado) + 1 write por
// nombre cambiado. Los que ya están bien no se tocan.
function NormalizeWorkerNamesSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [diffs, setDiffs] = useState([]); // [{ id, oldName, newName }]
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { updated, errors }
  const [showAll, setShowAll] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const preview = async () => {
    setLoading(true);
    setResult(null);
    setDiffs([]);
    setShowAll(false);
    try {
      // No caché — queremos datos frescos antes de escribir.
      const list = await workersService.list();
      setScanned(list.length);
      const changes = [];
      for (const w of list) {
        const oldName = String(w.name || "");
        const newName = toProperName(oldName);
        if (newName && newName !== oldName) {
          changes.push({ id: w.id, oldName, newName });
        }
      }
      // Orden alfabético por nombre nuevo para revisar cómodo.
      changes.sort((a, b) => a.newName.localeCompare(b.newName));
      setDiffs(changes);
    } catch (err) {
      toast.error("Error al leer trabajadores: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (diffs.length === 0) return;
    setConfirmApply(true);
  };

  const doApply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: diffs.length });
    let updated = 0;
    const errors = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      try {
        await workersService.update(d.id, { name: d.newName });
        updated++;
      } catch (err) {
        errors.push({ id: d.id, oldName: d.oldName, error: err.message || String(err) });
      }
      setProgress({ done: i + 1, total: diffs.length });
    }
    setResult({ updated, errors });
    setDiffs([]); // limpia el preview — para re-verificar, pedir preview de nuevo
    setRunning(false);
  };

  const displayDiffs = showAll ? diffs : diffs.slice(0, 20);

  return (
    <ConsoleCard id="normalizar-nombres-de-trabajadores" title="Normalizar nombres de trabajadores" 
      description={<>Convierte los <code>name</code> al formato "Juan Pérez" (primera letra
            mayúscula, resto minúscula, conectores en minúscula).
            Preview primero, después aplicar.</>} 
      actions={<><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={loading || running}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Analizando…" : "🔎 Preview cambios"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={running || diffs.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? `Aplicando… ${progress.done}/${progress.total}`
              : `✔ Aplicar ${diffs.length || ""} cambio${diffs.length === 1 ? "" : "s"}`}
          </button>
        </div></>}>

      {scanned > 0 && !loading && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Escaneados: <span className="font-semibold tabular-nums text-[var(--color-text)]">{fmtNumber(scanned)}</span>{" "}
          trabajadores · A cambiar:{" "}
          <span className={`font-semibold tabular-nums ${diffs.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
            {fmtNumber(diffs.length)}
          </span>
        </p>
      )}

      {diffs.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-1.5">RUT</th>
                <th className="px-3 py-1.5">Antes</th>
                <th className="px-3 py-1.5">Después</th>
              </tr>
            </thead>
            <tbody>
              {displayDiffs.map((d) => (
                <tr key={d.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1 font-mono text-[10px] text-[var(--color-muted)]">{d.id}</td>
                  <td className="px-3 py-1 text-[var(--color-muted)] line-through">{d.oldName}</td>
                  <td className="px-3 py-1 font-medium">{d.newName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diffs.length > 20 && !showAll && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Ver los {diffs.length - 20} restantes…
              </button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div>
            ✔ Actualizados:{" "}
            <span className="font-semibold tabular-nums text-[var(--color-success)]">
              {result.updated}
            </span>
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="mt-1 text-[var(--color-danger)]">
                ✖ Errores: {result.errors.length}
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-[var(--color-muted)]">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.id}</span> ({e.oldName}): {e.error}
                  </li>
                ))}
                {result.errors.length > 20 && <li>… y {result.errors.length - 20} más</li>}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Aplicar cambios de nombre"
        message={`¿Aplicar ${diffs.length} cambio(s) de nombre?\n\nEsta operación no se puede deshacer automáticamente. Revisá el preview antes de continuar.`}
        confirmLabel="Aplicar"
        danger
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => { setConfirmApply(false); doApply(); }}
      />
    </ConsoleCard>
  );
}

// Backfill: los logs de auditoría de "workday" escritos ANTES de que
// firestoreBase.js empezara a denormalizar `meta.workerRut`/`meta.cycleId`
// quedaron con `meta: null` — no aparecen en el buscador "por registro" de
// Audit.jsx cuando buscás por trabajador. El entityId de un workday ya trae
// el rut codificado (`cycleId__laborId__rut__fecha[__combo]`, ver
// utils/cosechaCombos.js → workdayDocId), así que se puede reconstruir sin
// tocar nada más del log. Aditivo y re-ejecutable: solo toca logs con
// `meta == null`, así que correrlo dos veces no hace nada la segunda vez.
function BackfillWorkdayLogMetaSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState(null); // [{ id, entityId, workerRut, cycleId }]
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const preview = async () => {
    setLoading(true);
    setResult(null);
    setCandidates(null);
    try {
      const q = query(collection(db, "logs"), where("entity", "==", "workday"), where("meta", "==", null));
      const snap = await getDocs(q);
      const rows = [];
      let bad = 0;
      for (const docSnap of snap.docs) {
        const entityId = docSnap.data().entityId || "";
        const parts = String(entityId).split("__");
        const [cycleId, , workerRut] = parts;
        if (parts.length < 4 || !workerRut) {
          bad++;
          continue;
        }
        rows.push({ id: docSnap.id, entityId, workerRut, cycleId });
      }
      setCandidates(rows);
      setSkipped(bad);
    } catch (err) {
      toast.error("Error al buscar logs de workday: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const CHUNK = 400; // margen bajo el límite de 500 ops por writeBatch
  const apply = () => {
    if (!candidates || candidates.length === 0) return;
    setConfirmApply(true);
  };

  const doApply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: candidates.length });
    let updated = 0;
    const errors = [];
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const c of chunk) {
        batch.update(doc(db, "logs", c.id), { meta: { workerRut: c.workerRut, cycleId: c.cycleId || null } });
      }
      try {
        await batch.commit();
        updated += chunk.length;
      } catch (err) {
        errors.push({ range: `${i + 1}-${i + chunk.length}`, error: err.message || String(err) });
      }
      setProgress({ done: Math.min(i + CHUNK, candidates.length), total: candidates.length });
    }
    setResult({ updated, errors });
    setCandidates(null);
    setRunning(false);
  };

  return (
    <ConsoleCard id="backfill-auditoria-de-workdays-por-traba" title="Backfill: auditoría de workdays por trabajador" 
      description={<>Completa <code>meta.workerRut</code>/<code>meta.cycleId</code> en logs viejos de workday
            (parseados del entityId) para que el buscador de Auditoría los encuentre por trabajador.</>} 
      actions={<><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={loading || running}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Buscando…" : "🔎 Preview"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={running || !candidates || candidates.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? `Aplicando… ${progress.done}/${progress.total}`
              : `✔ Aplicar ${candidates?.length || ""} log${candidates?.length === 1 ? "" : "s"}`}
          </button>
        </div></>}>

      {candidates !== null && !loading && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Logs viejos sin meta:{" "}
          <span className={`font-semibold tabular-nums ${candidates.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
            {fmtNumber(candidates.length)}
          </span>
          {skipped > 0 && <> · {fmtNumber(skipped)} con entityId no parseable (se dejan como están)</>}
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-1.5">RUT</th>
                <th className="px-3 py-1.5">Ciclo</th>
                <th className="px-3 py-1.5">entityId</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1 font-mono text-[10px]">{c.workerRut}</td>
                  <td className="px-3 py-1 font-mono text-[10px] text-[var(--color-muted)]">{c.cycleId}</td>
                  <td className="px-3 py-1 font-mono text-[10px] text-[var(--color-muted)]">{c.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length > 10 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center text-xs text-[var(--color-muted)]">
              … y {fmtNumber(candidates.length - 10)} más (muestra acotada a 10)
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div>
            ✔ Actualizados:{" "}
            <span className="font-semibold tabular-nums text-[var(--color-success)]">
              {result.updated}
            </span>
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="mt-1 text-[var(--color-danger)]">
                ✖ Errores: {result.errors.length}
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-[var(--color-muted)]">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    lote {e.range}: {e.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Backfill de logs"
        message={`¿Backfillear meta.workerRut/cycleId en ${candidates?.length || 0} log(s) viejos de workdays?\n\nEs aditivo — solo agrega el campo meta, no toca nada más del log. Se puede re-ejecutar sin problema.`}
        confirmLabel="Aplicar"
        danger
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => { setConfirmApply(false); doApply(); }}
      />
    </ConsoleCard>
  );
}

// Fase 1 de la migración "rut editable" (ver workersService.js): el campo
// `rut` recién se empezó a grabar en workers nuevos/editados. Los workers
// viejos solo tienen el rut como doc id, sin campo — este backfill lo
// completa (`rut: doc.id`) para que sean auto-descriptivos y el doc id pueda
// tratarse de acá en más como un `workerId` estable, independiente de si el
// rut legal cambia después. Aditivo y re-ejecutable: solo toca workers sin
// campo `rut`.
function BackfillWorkerRutFieldSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState(null); // [{ id, name }]
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const preview = async () => {
    setLoading(true);
    setResult(null);
    setCandidates(null);
    try {
      const all = await workersService.list();
      const rows = all.filter((w) => !w.rut).map((w) => ({ id: w.id, name: w.name || "" }));
      rows.sort((a, b) => a.id.localeCompare(b.id));
      setCandidates(rows);
    } catch (err) {
      toast.error("Error al leer trabajadores: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!candidates || candidates.length === 0) return;
    setConfirmApply(true);
  };

  const doApply = async () => {
    setRunning(true);
    setProgress({ done: 0, total: candidates.length });
    let updated = 0;
    const errors = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      try {
        await workersService.update(c.id, { rut: c.id });
        updated++;
      } catch (err) {
        errors.push({ id: c.id, error: err.message || String(err) });
      }
      setProgress({ done: i + 1, total: candidates.length });
    }
    setResult({ updated, errors });
    setCandidates(null);
    setRunning(false);
  };

  return (
    <ConsoleCard id="backfill-campo-rut-en-trabajadores" title="Backfill: campo rut en trabajadores" 
      description={<>Completa <code>worker.rut</code> (= doc id actual) en trabajadores viejos que todavía
            no lo tienen. Paso previo para poder editar el rut más adelante sin perder identidad.</>} 
      actions={<><div className="flex items-center gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={loading || running}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Buscando…" : "🔎 Preview"}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={running || !candidates || candidates.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? `Aplicando… ${progress.done}/${progress.total}`
              : `✔ Aplicar ${candidates?.length || ""} trabajador${candidates?.length === 1 ? "" : "es"}`}
          </button>
        </div></>}>

      {candidates !== null && !loading && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Sin campo rut:{" "}
          <span className={`font-semibold tabular-nums ${candidates.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}>
            {fmtNumber(candidates.length)}
          </span>
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-1.5">RUT (= id)</th>
                <th className="px-3 py-1.5">Nombre</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 10).map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1 font-mono text-[10px]">{c.id}</td>
                  <td className="px-3 py-1">{c.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length > 10 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center text-xs text-[var(--color-muted)]">
              … y {fmtNumber(candidates.length - 10)} más (muestra acotada a 10)
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div>
            ✔ Actualizados:{" "}
            <span className="font-semibold tabular-nums text-[var(--color-success)]">
              {result.updated}
            </span>
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="mt-1 text-[var(--color-danger)]">
                ✖ Errores: {result.errors.length}
              </div>
              <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-[var(--color-muted)]">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.id}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmApply}
        title="Completar campo rut"
        message={`¿Completar el campo rut en ${candidates?.length || 0} trabajador(es) (rut = id actual)?\n\nEs aditivo — no toca ningún otro campo. Se puede re-ejecutar sin problema.`}
        confirmLabel="Aplicar"
        danger
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => { setConfirmApply(false); doApply(); }}
      />
    </ConsoleCard>
  );
}

// ============================================================
// Migración única: anticipos al rut vigente
// ============================================================
// `advances` guardaba el rut de CREACIÓN del trabajador (el doc id). Para
// quien pasó de una cédula provisoria a un rut definitivo ese valor diverge
// del rut actual, y por eso la búsqueda de anticipos consultaba dos campos
// distintos — duplicando cada consulta de la nómina para rescatar un puñado
// de casos. Esta pasada re-apunta `workerRut` al rut vigente para que
// `worker.rut` quede como única clave foránea. `workerId` no se toca: queda
// como rastro de cuál era el id original.
function MigrateAdvanceRutsSection() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [cambian, setCambian] = useState(null);
  const [huerfanos, setHuerfanos] = useState([]);
  const [totales, setTotales] = useState(null);

  const preview = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [workers, advances] = await Promise.all([
        workersService.list({ order: ["name", "asc"] }),
        advancesService.list({ order: ["date", "desc"] }),
      ]);

      // doc id -> rut vigente. El fallback al id cubre a los workers creados
      // antes de que existiera el campo `rut`.
      const rutActual = new Map(workers.map((w) => [w.id, w.rut || w.id]));
      const nombre = new Map(workers.map((w) => [w.id, w.name || ""]));
      const rutsVigentes = new Set(workers.map((w) => w.rut || w.id));

      const aCambiar = [];
      const sinDueno = [];

      for (const a of advances) {
        const actual = String(a.workerRut || "");
        if (!actual) continue;
        const destino = rutActual.get(actual);

        if (destino === undefined) {
          // Ni doc id ni rut vigente de nadie: o ya migró, o quedó huérfano.
          if (!rutsVigentes.has(actual)) {
            sinDueno.push({ id: a.id, nombre: a.workerName || "", rut: actual, status: a.status || "pending" });
          }
          continue;
        }
        if (destino !== actual) {
          aCambiar.push({
            id: a.id,
            nombre: nombre.get(actual) || a.workerName || "",
            desde: actual,
            hacia: destino,
            status: a.status || "pending",
          });
        }
      }

      setCambian(aCambiar);
      setHuerfanos(sinDueno);
      setTotales({
        advances: advances.length,
        divergentes: workers.filter((w) => w.rut && w.rut !== w.id).length,
      });
    } catch (err) {
      setMsg(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!cambian?.length) return;
    setRunning(true);
    setMsg("");
    try {
      for (let i = 0; i < cambian.length; i += 450) {
        const batch = writeBatch(db);
        for (const c of cambian.slice(i, i + 450)) {
          batch.update(doc(db, "advances", c.id), { workerRut: c.hacia, updatedAt: serverTimestamp() });
        }
        await batch.commit();
      }
      advancesService.invalidate();
      setMsg(`✓ Migrados ${cambian.length} anticipo(s).`);
      await preview();
    } catch (err) {
      setMsg(`Error al migrar: ${err.message || err}`);
    } finally {
      setRunning(false);
    }
  };

  const vigentes = (cambian || []).filter((c) => c.status === "pending" || c.status === "partial").length;

  return (
    <ConsoleCard
      id="migrar-anticipos-rut"
      title="Migración: anticipos al rut vigente"
      description={<>Re-apunta <code>advances.workerRut</code> al rut actual del trabajador para que <code>worker.rut</code> sea la única clave foránea. <code>workerId</code> no se toca.</>}
      actions={<>
        <button
          type="button"
          onClick={preview}
          disabled={loading || running}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          {loading ? "Buscando…" : "🔎 Preview"}
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={running || !cambian || cambian.length === 0}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {running ? "Migrando…" : `✔ Migrar ${cambian?.length || ""} anticipo(s)`}
        </button>
      </>}
    >
      {msg && <p className="mb-3 text-sm">{msg}</p>}

      {totales && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          {totales.advances} anticipo(s) · {totales.divergentes} trabajador(es) con rut distinto del id
          {cambian ? ` · ${cambian.length} a migrar (${vigentes} vigente(s))` : ""}
        </p>
      )}

      {cambian && cambian.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          Nada que migrar: todos los anticipos ya apuntan al rut vigente.
        </p>
      )}

      {cambian && cambian.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Trabajador</th>
                <th className="px-3 py-2 font-semibold">Desde (id)</th>
                <th className="px-3 py-2 font-semibold">Hacia (rut vigente)</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cambian.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{c.nombre || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.desde}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{c.hacia}</td>
                  <td className="px-3 py-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {huerfanos.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold">
            ⚠ {huerfanos.length} anticipo(s) sin trabajador que coincida — no se tocan
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-[var(--color-muted)]">
            {huerfanos.map((h) => (
              <li key={h.id}>{h.rut} · {h.nombre || "sin nombre"} · {h.status}</li>
            ))}
          </ul>
        </div>
      )}
    </ConsoleCard>
  );
}

// ============================================================
// Saludos personalizados por usuario
// ============================================================
// Editor de `users/{uid}.greetings`. El texto no vive en el código: un saludo
// hardcodeado deja el mail de una persona real en el repo y fuera de contexto
// puede leerse como cualquier otra cosa.
//
// Cuesta 1 lectura por usuario (son pocos) y solo al desplegar la sección.
function GreetingsSection() {
  const [usuarios, setUsuarios] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  // uid → { [slot]: texto } con lo que el usuario está tipeando.
  const [borradores, setBorradores] = useState({});
  const [guardando, setGuardando] = useState("");
  const [guardado, setGuardado] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError("");
    try {
      const lista = await usersService.list({ order: ["email", "asc"] });
      setUsuarios(lista);
      const inicial = {};
      for (const u of lista) inicial[u.id] = { ...(u.greetings || {}) };
      setBorradores(inicial);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCargando(false);
    }
  };

  const editar = (uid, slot, valor) => {
    setBorradores((b) => ({ ...b, [uid]: { ...(b[uid] || {}), [slot]: valor } }));
    setGuardado("");
  };

  // Se escribe el mapa `greetings` completo porque `updateDoc` reemplaza el
  // objeto entero: mandar una sola clave borraría las demás.
  const guardar = async (uid) => {
    setGuardando(uid);
    setError("");
    try {
      const mapa = {};
      for (const f of GREETING_FIELDS) {
        const texto = (borradores[uid]?.[f.slot] || "").trim();
        if (texto) mapa[f.slot] = texto;
      }
      await usersService.update(uid, { greetings: mapa });
      setUsuarios((lista) =>
        (lista || []).map((u) => (u.id === uid ? { ...u, greetings: mapa } : u)),
      );
      setGuardado(uid);
      setTimeout(() => setGuardado((g) => (g === uid ? "" : g)), 2500);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setGuardando("");
    }
  };

  const sinGuardar = (uid) => {
    const actual = usuarios?.find((u) => u.id === uid)?.greetings || {};
    return GREETING_FIELDS.some(
      (f) => (borradores[uid]?.[f.slot] || "").trim() !== (actual[f.slot] || "").trim(),
    );
  };

  return (
    <ConsoleCard
      id="greetings"
      title="Saludos personalizados"
      description={
        <>
          Textos que ve un usuario y nadie más. Vacío = sin saludo, vuelve al default.
        </>
      }
      actions={
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {cargando ? "Cargando…" : usuarios ? "↻ Recargar" : "▶ Cargar usuarios"}
        </button>
      }
    >
      {error ? (
        <p className="mb-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {!usuarios ? (
        <p className="text-xs text-[var(--color-muted)]">
          Sin cargar. Cuesta 1 lectura por usuario.
        </p>
      ) : usuarios.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No hay perfiles en `users`.</p>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => {
            const pendiente = sinGuardar(u.id);
            return (
              <div
                key={u.id}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.email || "(sin email)"}</div>
                    <div className="font-mono text-[10px] text-[var(--color-muted)]">
                      {u.id}
                      {u.role ? ` · ${u.role}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => guardar(u.id)}
                    disabled={!pendiente || guardando === u.id}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
                  >
                    {guardando === u.id
                      ? "Guardando…"
                      : guardado === u.id
                        ? "✓ Guardado"
                        : "Guardar"}
                  </button>
                </div>

                {GREETING_FIELDS.map((f) => (
                  <label key={f.slot} className="mt-2 block">
                    <span className="block text-[11px] font-medium">{f.label}</span>
                    <span className="block text-[10px] text-[var(--color-muted)]">{f.note}</span>
                    <input
                      type="text"
                      value={borradores[u.id]?.[f.slot] || ""}
                      onChange={(e) => editar(u.id, f.slot, e.target.value)}
                      placeholder="(sin saludo)"
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </ConsoleCard>
  );
}
