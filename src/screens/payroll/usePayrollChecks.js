import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { listGroupLeaders, qrPrefixesService } from "../../services";
import { listEmployments } from "../../services/employmentsService";
import { signerName } from "../../services/signer";
import { assignGroupLeaders } from "../../services/workersService";
import { errorText } from "../../utils/errorText";
import { normalizeLeader } from "../../utils/payroll";
import { attempt } from "../../utils/attempt";
import { localIsoDate } from "../../utils/dates";
import { checkSummary, payrollChecksOf, withReviews } from "../../utils/payrollChecks/payrollChecks";

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
// cuando cambian ellas o `resetKey` (una vista previa nueva). Con `enabled` en
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

  // Marca o desmarca como revisadas las alertas de `keys`. Devuelve la lista
  // nueva, para guardarla.
  const setReviewed = (keys, on) => {
    const drop = new Set(keys);
    const rest = reviewed.map((e) => ({ ...e, keys: (e.keys || []).filter((k) => !drop.has(k)) })).filter((e) => e.keys.length);
    const next = on ? [...rest, { keys: [...drop], by: user?.uid || "", byName: signerName() || "", at: new Date().toISOString() }] : rest;
    setReviewedList(next);
    return next;
  };

  // Vuelve a las revisadas con que partió (si no se pudo guardar un cambio).
  const resetReviewed = () => setReviewedList(reviewedChecks);

  // Los grupos habilitados, para elegir uno.
  const leaderOptions = useMemo(
    () => [...new Set((leaders || []).filter((d) => d.habilitado === true).map((d) => normalizeLeader(d.name || d.nombre || d.id)).filter(Boolean))].sort(),
    [leaders],
  );

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

  return { alerts, summary, alertsByRut, reviewed, setReviewed, resetReviewed, leaderOptions, assignGroups, assigning };
}
