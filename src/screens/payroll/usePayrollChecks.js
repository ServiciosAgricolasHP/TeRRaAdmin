import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { ensureGroupLeaders, listGroupLeaders, qrPrefixesService } from "../../services";
import { listEmployments } from "../../services/employmentsService";
import { signerName } from "../../services/signer";
import { assignGroupLeaders } from "../../services/workersService";
import { errorText } from "../../utils/errorText";
import { enabledLeaderNames } from "../../utils/groupLeaders";
import { attempt } from "../../utils/attempt";
import { localIsoDate } from "../../utils/dates";
import { alertSignature, applyReviewChange, checkSummary, payrollChecksOf, withReviews } from "../../utils/payrollChecks/payrollChecks";

const NO_REVIEWS = [];

// La revisión de una nómina (ver `utils/payrollChecks/`): sus alertas, el
// resumen por nivel y cuáles se marcaron revisadas. Lee la lista de líderes y
// la de contratos (las dos guardadas en el navegador) y, con `qrSync`, los
// prefijos QR, sin caché: su última sincronización tiene que estar al día.
// Mientras no llegan, o si fallan, las revisiones que los usan no corren.
//
// `items` son las filas que paga la nómina y `workdays`, las jornadas de donde
// salen: cuentan solo las de esas filas. `reviewedChecks` son las revisadas
// con que parte; marcar o desmarcar las cambia acá, y vuelven a ser esas
// cuando cambian ellas o `resetKey` (otra nómina). Una marca vale mientras la
// alerta diga lo mismo (`withReviews`), así que rehacer la vista previa no la
// suelta. `place` ("generate" o "detail") queda en cada marca. Con `enabled` en
// `false` no lee nada. `onWorkersChanged` corre después de asignar grupos,
// para que la pantalla traiga las fichas al día.
export function usePayrollChecks({
  enabled = true,
  items,
  workdays,
  openWorkdays,
  cycles,
  workers,
  payrolls,
  payrollId = null,
  createdAt = null,
  reviewedChecks = NO_REVIEWS,
  resetKey = null,
  place = "",
  onWorkersChanged = null,
  qrSync = true,
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [assigning, setAssigning] = useState(false);
  const [leaders, setLeaders] = useState(null);
  const [employments, setEmployments] = useState(null);
  const [prefixes, setPrefixes] = useState(null);
  const [reviewed, setReviewedList] = useState(reviewedChecks);
  if (useValuesChanged([reviewedChecks, resetKey])) setReviewedList(reviewedChecks);

  const loadLists = useEffectEvent(async () => {
    const [l, e, q] = await Promise.all([
      attempt(() => listGroupLeaders()),
      attempt(() => listEmployments()),
      qrSync ? attempt(() => qrPrefixesService.list({ order: ["label", "asc"] })) : { value: null },
    ]);
    if (l.value) setLeaders(l.value);
    if (e.value) setEmployments(e.value);
    if (q.value) setPrefixes(q.value);
  });
  useEffect(() => {
    if (enabled) loadLists();
  }, [enabled]);

  // Al editar la vista previa, la revisión se rehace sin trabar lo que se escribe.
  const deferredItems = useDeferredValue(items);

  const alerts = useMemo(() => {
    if (!enabled) return [];
    const ids = new Set(deferredItems.flatMap((it) => it.workdayIds || []));
    const own = workdays.filter((wd) => ids.has(wd.id));
    const found = payrollChecksOf({
      items: deferredItems,
      workdays: own,
      openWorkdays,
      cycles,
      workers,
      payrolls,
      payrollId,
      createdAt,
      leaders,
      employments,
      prefixes: qrSync ? prefixes : null,
      today: localIsoDate(),
    });
    return withReviews(found, reviewed);
  }, [enabled, deferredItems, workdays, openWorkdays, cycles, workers, payrolls, payrollId, createdAt, leaders, employments, prefixes, qrSync, reviewed]);

  const summary = useMemo(() => checkSummary(alerts), [alerts]);

  // Las alertas de cada fila, por su RUT.
  const alertsByRut = useMemo(() => {
    const map = new Map();
    for (const a of alerts) {
      if (a.general) continue;
      if (!map.has(a.rut)) map.set(a.rut, []);
      map.get(a.rut).push(a);
    }
    return map;
  }, [alerts]);

  // Marca o desmarca como revisadas las alertas de `keys`, con la huella de
  // cada una. Devuelve el cambio (`applyReviewChange`), para guardarlo.
  const setReviewed = (keys, on) => {
    const byKey = new Map(alerts.map((a) => [a.key, a]));
    const signatures = on ? Object.fromEntries(keys.filter((k) => byKey.has(k)).map((k) => [k, alertSignature(byKey.get(k))])) : {};
    const change = { keys, on, by: user?.uid || "", byName: signerName() || "", at: new Date().toISOString(), place, signatures };
    setReviewedList(applyReviewChange(reviewed, change));
    return change;
  };

  // Vuelve a `list` o, sin ella, a las revisadas con que partió (si no se pudo
  // guardar un cambio).
  const resetReviewed = (list) => setReviewedList(list ?? reviewedChecks);

  // Los grupos habilitados, para elegir uno.
  const leaderOptions = useMemo(() => enabledLeaderNames(leaders), [leaders]);

  // Agrega a la lista de líderes, habilitados, los grupos de `names` que no
  // están. Devuelve si se guardó.
  const addLeaders = async (names) => {
    if (!names.length) return false;
    setAssigning(true);
    const { value, error } = await attempt(async () => {
      const result = await ensureGroupLeaders(names);
      setLeaders(await listGroupLeaders());
      return result;
    });
    setAssigning(false);
    if (error) {
      toast.error(`No se pudo agregar a la lista: ${errorText(error)}`);
      return false;
    }
    const n = value.created.length;
    toast.success(n === 1 ? "1 grupo agregado a la lista de líderes" : `${n} grupos agregados a la lista de líderes`);
    return true;
  };

  // Les pone el grupo en su ficha a `assignments` (`[{ person, leader }]`).
  // Devuelve si se guardó.
  const assignGroups = async (assignments) => {
    const byId = new Map(workers.map((w) => [w.id, w]));
    const list = assignments.map((a) => ({ worker: byId.get(a.person), leader: a.leader })).filter((a) => a.worker);
    if (!list.length) return false;
    setAssigning(true);
    const { value: count, error } = await attempt(() => assignGroupLeaders(list));
    setAssigning(false);
    if (error) {
      toast.error(`No se pudo asignar el grupo: ${errorText(error)}`);
      return false;
    }
    toast.success(count === 1 ? "Grupo asignado a 1 persona" : `Grupo asignado a ${count} personas`);
    onWorkersChanged?.();
    return true;
  };

  return { alerts, summary, alertsByRut, reviewed, setReviewed, resetReviewed, leaderOptions, assignGroups, addLeaders, assigning };
}
