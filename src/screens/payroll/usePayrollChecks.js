import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { listGroupLeaders } from "../../services";
import { listEmployments } from "../../services/employmentsService";
import { signerName } from "../../services/signer";
import { attempt } from "../../utils/attempt";
import { localIsoDate } from "../../utils/dates";
import { checkSummary, payrollChecksOf, withReviews } from "../../utils/payrollChecks/payrollChecks";

const NO_REVIEWS = [];

// La revisión de una nómina (ver `utils/payrollChecks/`): sus alertas, el
// resumen por nivel y cuáles se marcaron revisadas. Lee la lista de líderes y
// la de contratos (las dos guardadas en el navegador); mientras no llegan, o
// si fallan, las revisiones que las usan no corren.
//
// `items` son las filas que paga la nómina y `workdays`, las jornadas de donde
// salen: cuentan solo las de esas filas. `reviewedChecks` son las revisadas
// con que parte; marcar o desmarcar las cambia acá, y vuelven a ser esas
// cuando cambian ellas o `resetKey` (una vista previa nueva). Con `enabled` en
// `false` no lee nada.
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
}) {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState(null);
  const [employments, setEmployments] = useState(null);
  const [reviewed, setReviewedList] = useState(reviewedChecks);
  if (useValuesChanged([reviewedChecks, resetKey])) setReviewedList(reviewedChecks);

  const loadLists = useEffectEvent(async () => {
    const [l, e] = await Promise.all([attempt(() => listGroupLeaders()), attempt(() => listEmployments())]);
    if (l.value) setLeaders(l.value);
    if (e.value) setEmployments(e.value);
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
      today: localIsoDate(),
    });
    return withReviews(found, reviewed);
  }, [enabled, deferredItems, workdays, openWorkdays, cycles, workers, payrolls, payrollId, createdAt, leaders, employments, reviewed]);

  const summary = useMemo(() => checkSummary(alerts), [alerts]);

  // Las alertas de cada fila, por su RUT.
  const alertsByRut = useMemo(() => {
    const map = new Map();
    for (const a of alerts) {
      if (!map.has(a.rut)) map.set(a.rut, []);
      map.get(a.rut).push(a);
    }
    return map;
  }, [alerts]);

  // Marca o desmarca como revisadas las alertas de `keys`.
  const setReviewed = (keys, on) => {
    const drop = new Set(keys);
    setReviewedList((prev) => {
      const rest = prev.map((e) => ({ ...e, keys: (e.keys || []).filter((k) => !drop.has(k)) })).filter((e) => e.keys.length);
      return on ? [...rest, { keys: [...drop], by: user?.uid || "", byName: signerName() || "", at: new Date().toISOString() }] : rest;
    });
  };

  return { alerts, summary, alertsByRut, reviewed, setReviewed };
}
