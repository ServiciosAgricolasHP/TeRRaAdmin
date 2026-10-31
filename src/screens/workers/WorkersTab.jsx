import { useEffect, useEffectEvent, useMemo, useState, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { AG_GRID_LOCALE_ES } from "../../utils/agGridLocale";
import { deleteWorkerSafe, detectQueryKind, listWorkers } from "../../services/workersService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import {
  bankName,
  accountTypeLabel,
  isCuentaRut,
  isCashBank,
  paysToOtherPerson,
  lacksPaymentName,
} from "../../utils/banks";
import WorkerEditModal from "../../components/WorkerEditModal";
import { useToast } from "../../contexts/ToastContext";
import WorkerSummaryModal from "../../components/WorkerSummaryModal";
import GroupSummaryModal from "../../components/GroupSummaryModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { MIN_WORKER_QUERY, workerMatchesQuery, workerQueryReady } from "../../utils/workerSearch";
import { useIsMobile } from "../../hooks/useIsMobile";
import ScreenLoader from "../../components/ScreenLoader";
import { useEmployers } from "../../hooks/useEmployers";
import { useEmploymentsFrom } from "../../hooks/useEmploymentsFrom";
import { localIsoDate } from "../../utils/dates";
import { EMPLOYMENT_FILTERS, activeByWorker, matchesEmploymentFilter } from "../../utils/employment";
import { attempt } from "../../utils/attempt";

ModuleRegistry.registerModules([AllCommunityModule]);

// Lo que muestra la columna Titular: el nombre solo si la cuenta es de otra
// persona, y un aviso si ese nombre falta.
function payeeColumnText(w) {
  if (lacksPaymentName(w)) return "⚠ Falta el titular";
  return paysToOtherPerson(w.rut || w.id, w.bankDetails?.[0]) ? w.paymentName : "";
}

// Mínimo de caracteres para que la búsqueda libre filtre la lista. El filtro
// corre en cliente sobre la lista cacheada, y los filtros de líder y forma de
// pago no dependen de este mínimo.

export default function WorkersTab() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [summary, setSummary] = useState(null);
  const [groupSummaryOpen, setGroupSummaryOpen] = useState(false);
  const [search, setSearch] = useState("");
  // `allWorkers` es la única fuente de datos de la pantalla: la caché
  // del navegador (`listWorkers`).
  const [allWorkers, setAllWorkers] = useState([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  // Filtros opcionales componibles con la búsqueda de texto.
  // leaderFilter: "" | "__none__" | <nombre líder UPPER>
  // payFilter: "" | "cash" | "transfer"
  const [leaderFilter, setLeaderFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  // Solo quienes cobran en la cuenta de otra persona sin su nombre.
  const [missingPayeeOnly, setMissingPayeeOnly] = useState(false);
  // Contrato u honorarios vigentes hoy: "" | "contract" | "fees" | "none", y
  // el empleador. Los períodos se leen solo con el filtro en uso.
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [employerFilter, setEmployerFilter] = useState("");
  const today = localIsoDate();
  const employmentOn = employmentFilter !== "" || employerFilter !== "";
  const { employments, loading: employmentsLoading } = useEmploymentsFrom(today, employmentOn);
  const { employers } = useEmployers();

  const queryKind = detectQueryKind(search);
  const queryRaw = search.trim();
  const queryReady = workerQueryReady(queryRaw);
  const filtersActive = leaderFilter !== "" || payFilter !== "" || employmentOn || missingPayeeOnly;

  // Carga la lista completa de trabajadores; lee Firestore solo si la caché
  // venció o no existe. Si ya está cargada, la devuelve sin esperar.
  const ensureAllForModal = async () => {
    if (allWorkers.length) return allWorkers;
    setCacheLoading(true);
    const { value: list, error: err } = await attempt(() => listWorkers());
    setCacheLoading(false);
    if (err) {
      toast.error("No se pudo cargar la lista de trabajadores: " + (err.message || err));
      return [];
    }
    setAllWorkers(list);
    return list;
  };

  // Precarga la lista al montar, para que el filtro funcione desde el primer
  // carácter.
  const loadOnMount = useEffectEvent(() => ensureAllForModal());
  useEffect(() => {
    loadOnMount();
  }, []);

  // Líderes únicos para el dropdown (extraídos del dataset completo cacheado).
  const leaderOptions = useMemo(() => {
    const set = new Set();
    for (const w of allWorkers) {
      const l = (w.groupLeader?.[0] || "").toString().toUpperCase().trim();
      if (l) set.add(l);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [allWorkers]);

  // Cuántos cobran en la cuenta de otra persona sin su nombre; el filtro se
  // ofrece mientras quede alguno.
  const missingPayeeCount = useMemo(() => allWorkers.filter(lacksPaymentName).length, [allWorkers]);

  // Filtrado en cliente sobre `allWorkers`:
  //   1. Líder, si hay uno elegido.
  //   2. Forma de pago (efectivo o transferencia) y la cuenta de otra
  //      persona sin el nombre del titular.
  //   3. Búsqueda libre (`workerMatchesQuery`): cada palabra en el nombre, en
  //      cualquier orden y sin acentos, o una parte del RUT o del id.
  // Sin búsqueda ni filtros devuelve [] y se ve el estado vacío.
  const displayedResults = useMemo(() => {
    if (!queryReady && !filtersActive) return [];
    let arr = allWorkers;
    if (leaderFilter === "__none__") {
      arr = arr.filter((w) => !((w.groupLeader?.[0] || "").toString().trim()));
    } else if (leaderFilter) {
      arr = arr.filter(
        (w) => (w.groupLeader?.[0] || "").toString().toUpperCase().trim() === leaderFilter,
      );
    }
    if (payFilter === "cash") {
      arr = arr.filter((w) => isCashBank(w.bankDetails?.[3]));
    } else if (payFilter === "transfer") {
      arr = arr.filter((w) => w.bankDetails?.[3] && !isCashBank(w.bankDetails?.[3]));
    }
    if (missingPayeeOnly) arr = arr.filter(lacksPaymentName);
    if (employmentOn) {
      const active = activeByWorker(employments, today);
      arr = arr.filter((w) => matchesEmploymentFilter(active.get(w.id), { type: employmentFilter, employerId: employerFilter }));
    }
    if (queryReady) arr = arr.filter((w) => workerMatchesQuery(w, queryRaw));
    return arr;
  }, [queryReady, filtersActive, leaderFilter, payFilter, missingPayeeOnly, allWorkers, queryRaw, employmentOn, employments, today, employmentFilter, employerFilter]);

  const showResults = filtersActive || queryReady;
  const clearFilters = () => {
    setLeaderFilter("");
    setPayFilter("");
    setMissingPayeeOnly(false);
    setEmploymentFilter("");
    setEmployerFilter("");
  };

  // Tras editar o eliminar, vuelve a tomar la lista de la caché, que
  // `workersService` ya actualizó en modo aditivo.
  const refreshCache = async () => {
    await attempt(async () => {
      const list = await listWorkers();
      setAllWorkers(list);
    });
  };

  const onSaved = async () => {
    setEdit(null);
    await refreshCache();
  };

  const openCreate = async () => {
    await ensureAllForModal();
    setEdit({ mode: "create", worker: null });
  };

  const openEdit = async (worker) => {
    await ensureAllForModal();
    setEdit({ mode: "edit", worker });
  };

  // Copia el RUT con puntos y guion.
  const copyRut = async (value, label = "RUT") => {
    const rut = formatRutForDisplay(value);
    if (!rut) return;
    const { error: err } = await attempt(async () => {
      await navigator.clipboard.writeText(rut);
      toast.success(`${label} ${rut} copiado`);
    });
    if (err) toast.error(`No se pudo copiar el ${label}`);
  };

  const askDelete = (worker) => setConfirm({ worker });
  const doDelete = async () => {
    if (!confirm) return;
    setConfirm((c) => ({ ...c, busy: true }));
    const { error: err } = await attempt(async () => {
      await deleteWorkerSafe(confirm.worker);
      setConfirm(null);
      await refreshCache();
    });
    if (err) {
      toast.error(err.message || "Error al eliminar");
      setConfirm(null);
    }
  };

  // Las columnas se arman una vez: si cambiaran en cada render, ag-grid las
  // volvería a aplicar. Sus botones llaman a las acciones vigentes por
  // `actionsRef`, que se pone al día después de cada render.
  const actionsRef = useRef(null);
  useEffect(() => {
    actionsRef.current = { copyRut, openEdit, askDelete };
  });
  const columnDefs = useMemo(
    () => [
      {
        headerName: "RUT",
        // Muestra el rut actual (campo `rut`), no el id, que es el rut de
        // creación y no cambia. Sin campo `rut`, usa el id.
        valueGetter: (p) => p.data.rut || p.data.id,
        width: 140,
        valueFormatter: (p) => formatRutForDisplay(p.value),
        pinned: "left",
        cellRenderer: (p) => (
          <button
            type="button"
            onClick={() => actionsRef.current.copyRut(p.value)}
            title="Copiar RUT"
            className="w-full text-left hover:text-[var(--color-accent)] hover:underline"
          >
            {p.valueFormatted}
          </button>
        ),
      },
      { headerName: "Nombre", field: "name", flex: 1, minWidth: 180, pinned: "left" },
      { headerName: "Líder", valueGetter: (p) => (p.data.groupLeader?.[0] || "").toUpperCase().trim() || "—", width: 160 },
      {
        headerName: "IDs QR",
        valueGetter: (p) => (p.data.idQr || []).join(", ") || "—",
        flex: 1,
        minWidth: 140,
      },
      {
        headerName: "Banco",
        valueGetter: (p) => bankName(p.data.bankDetails?.[3]),
        width: 200,
        cellRenderer: (p) => {
          const cash = isCashBank(p.data.bankDetails?.[3]);
          return (
            <span className={cash ? "font-medium text-[var(--color-accent)]" : ""}>
              {bankName(p.data.bankDetails?.[3]) || "—"}
            </span>
          );
        },
      },
      {
        headerName: "Tipo cuenta",
        valueGetter: (p) => accountTypeLabel(p.data.bankDetails?.[2]),
        width: 140,
        cellRenderer: (p) => (
          <span className={isCuentaRut(p.data.bankDetails) ? "text-[var(--color-accent)]" : ""}>
            {accountTypeLabel(p.data.bankDetails?.[2])}
          </span>
        ),
      },
      { headerName: "N° cuenta", valueGetter: (p) => p.data.bankDetails?.[1] || "—", width: 140 },
      {
        headerName: "RUT pago",
        valueGetter: (p) => formatRutForDisplay(p.data.bankDetails?.[0] || ""),
        width: 130,
        cellRenderer: (p) =>
          p.value ? (
            <button
              type="button"
              onClick={() => actionsRef.current.copyRut(p.value, "RUT de pago")}
              title="Copiar RUT de pago"
              className="w-full text-left hover:text-[var(--color-accent)] hover:underline"
            >
              {p.value}
            </button>
          ) : null,
      },
      {
        // Solo cuando la cuenta es de otra persona; si falta el nombre, se marca.
        headerName: "Titular",
        valueGetter: (p) => payeeColumnText(p.data),
        width: 170,
        cellClass: (p) => (p.value === "⚠ Falta el titular" ? "text-[var(--color-warning)]" : ""),
      },
      {
        headerName: "",
        width: 260,
        pinned: "right",
        cellRenderer: (p) => {
          const isCash = isCashBank(p.data.bankDetails?.[3]);
          return (
            <div className="flex h-full items-center gap-1">
              {/* Indicador de forma de pago, no un toggle: Banco ↔ Efectivo
                  se cambia en el modal de edición. */}
              <span
                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${
                  isCash
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                }`}
                title={isCash ? "Pago en efectivo" : "Pago por transferencia"}
              >
                {isCash ? "💵 Efectivo" : "🏦 Transferencia"}
              </span>
              <button
                onClick={() => setSummary(p.data)}
                title="Ver resumen del trabajador"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                📊
              </button>
              <button
                onClick={() => actionsRef.current.openEdit(p.data)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                Editar
              </button>
              <button
                onClick={() => actionsRef.current.askDelete(p.data)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
              >
                ✕
              </button>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">
            {cacheLoading && allWorkers.length === 0
              ? "Cargando trabajadores..."
              : showResults
                ? `${displayedResults.length} resultado(s) · ${allWorkers.length} en total`
                : `Busca por nombre, apellido o RUT (mín. ${MIN_WORKER_QUERY} caracteres) · ${allWorkers.length} trabajadores`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-80">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, apellido o RUT…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-16 text-sm shadow-sm outline-none focus:border-[var(--color-accent)]"
            />
            {queryKind && (
              <span className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                {queryKind === "rut" ? "RUT" : "Nombre"}
              </span>
            )}
          </div>
          <button
            onClick={() => setGroupSummaryOpen(true)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)] sm:w-auto"
            title="Armar un grupo de trabajadores y generar matriz + resúmenes individuales"
          >
            📊 Resúmenes por grupo
          </button>
          <button
            onClick={openCreate}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] sm:w-auto"
          >
            + Nuevo trabajador
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={leaderFilter}
          onChange={(e) => setLeaderFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs shadow-sm focus:border-[var(--color-accent)] outline-none"
          title="Filtrar por líder de grupo"
        >
          <option value="">👥 Líder: todos</option>
          <option value="__none__">— Sin líder —</option>
          {leaderOptions.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setPayFilter((v) => (v === "cash" ? "" : "cash"))}
          className={`rounded-md border px-2 py-1.5 ${
            payFilter === "cash"
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
          }`}
        >
          💵 Efectivo
        </button>
        <button
          type="button"
          onClick={() => setPayFilter((v) => (v === "transfer" ? "" : "transfer"))}
          className={`rounded-md border px-2 py-1.5 ${
            payFilter === "transfer"
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
          }`}
        >
          🏦 Transferencia
        </button>
        {(missingPayeeCount > 0 || missingPayeeOnly) && (
          <button
            type="button"
            onClick={() => setMissingPayeeOnly((v) => !v)}
            title="Cobran en la cuenta de otra persona y su ficha no dice de quién es"
            className={`rounded-md border px-2 py-1.5 ${
              missingPayeeOnly
                ? "border-[var(--color-warning)] bg-[var(--color-warning)] text-white"
                : "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:opacity-80"
            }`}
          >
            ⚠ Sin titular ({missingPayeeCount})
          </button>
        )}
        <select
          value={employmentFilter}
          onChange={(e) => setEmploymentFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs shadow-sm focus:border-[var(--color-accent)] outline-none"
          title="Contrato u honorarios vigentes hoy"
          aria-label="Contrato u honorarios"
        >
          <option value="">📄 Contrato: todos</option>
          {Object.entries(EMPLOYMENT_FILTERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {employmentFilter !== "none" && employers.length > 0 && (
          <select
            value={employerFilter}
            onChange={(e) => setEmployerFilter(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs shadow-sm focus:border-[var(--color-accent)] outline-none"
            aria-label="Empleador"
          >
            <option value="">🏢 Empleador: todos</option>
            {employers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {employmentOn && employmentsLoading && <span className="text-[var(--color-muted)]">Cargando contratos…</span>}
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
          >
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      {/* Ocupa el alto restante, sin alto fijo: la lista es el último
          elemento de la pantalla. Mismo patrón que Advances.jsx. */}
      <div
        className={`min-h-0 flex-1 ${isMobile ? "overflow-y-auto" : "ag-theme-quartz ag-theme-app"}`}
      >
        {cacheLoading && allWorkers.length === 0 ? (
          <ScreenLoader label="Cargando trabajadores…" className="h-full" />
        ) : !showResults ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
            Busca por nombre, apellido o RUT (mín. {MIN_WORKER_QUERY} caracteres) o activa un filtro para listar.
          </div>
        ) : displayedResults.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
            Sin resultados{search ? ` para "${search}"` : ""}.
          </div>
        ) : isMobile ? (
          <div className="space-y-2">
            {displayedResults.map((w) => {
              const isCash = isCashBank(w.bankDetails?.[3]);
              const leader = (w.groupLeader?.[0] || "").toUpperCase().trim() || "—";
              const otherPayee = paysToOtherPerson(w.rut || w.id, w.bankDetails?.[0]);
              return (
                <div
                  key={w.id}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2"
                >
                  <div>
                    <div className="text-base font-semibold leading-tight">{w.name}</div>
                    <button
                      type="button"
                      onClick={() => copyRut(w.rut || w.id)}
                      title="Copiar RUT"
                      className="-mx-1 inline-flex min-h-[32px] items-center gap-1 rounded px-1 font-mono text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] active:bg-[var(--color-accent-soft)]"
                    >
                      {formatRutForDisplay(w.rut || w.id)}
                      <span aria-hidden="true">📋</span>
                    </button>
                  </div>
                  <div className="text-xs">
                    <span className={isCash ? "font-medium text-[var(--color-accent)]" : ""}>
                      {bankName(w.bankDetails?.[3]) || "—"}
                    </span>
                    <span className="mx-1 text-[var(--color-muted)]">·</span>
                    <span className={isCuentaRut(w.bankDetails) ? "text-[var(--color-accent)]" : ""}>
                      {accountTypeLabel(w.bankDetails?.[2])}
                    </span>
                    {w.bankDetails?.[1] && (
                      <>
                        <span className="mx-1 text-[var(--color-muted)]">·</span>
                        <span className="font-mono">{w.bankDetails[1]}</span>
                      </>
                    )}
                  </div>
                  {otherPayee && (
                    <div className="text-xs text-[var(--color-muted)]">
                      Cuenta de:{" "}
                      {lacksPaymentName(w) ? (
                        <span className="text-[var(--color-warning)]">⚠ falta el titular</span>
                      ) : (
                        <span className="text-[var(--color-text)]">{w.paymentName}</span>
                      )}{" "}
                      <span className="font-mono">{formatRutForDisplay(w.bankDetails[0])}</span>
                    </div>
                  )}
                  <div className="text-xs text-[var(--color-muted)]">
                    Líder: <span className="text-[var(--color-text)]">{leader}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${
                        isCash
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                      }`}
                      title={isCash ? "Pago en efectivo" : "Pago por transferencia"}
                    >
                      {isCash ? "💵 Efectivo" : "🏦 Transferencia"}
                    </span>
                    <button
                      onClick={() => setSummary(w)}
                      title="Ver resumen del trabajador"
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                    >
                      📊
                    </button>
                    <button
                      onClick={() => openEdit(w)}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => askDelete(w)}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <AgGridReact
            theme="legacy"
            rowData={displayedResults}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true, sortable: true, filter: true }}
            getRowId={(p) => p.data.id}
            localeText={AG_GRID_LOCALE_ES}
          />
        )}
      </div>

      <WorkerEditModal
        open={!!edit}
        mode={edit?.mode}
        worker={edit?.worker}
        allWorkers={allWorkers}
        onClose={() => setEdit(null)}
        onSaved={onSaved}
      />

      <WorkerSummaryModal
        open={!!summary}
        worker={summary}
        onClose={() => setSummary(null)}
      />

      <GroupSummaryModal
        open={groupSummaryOpen}
        onClose={() => setGroupSummaryOpen(false)}
      />

      <ConfirmDialog
        open={!!confirm}
        title="Eliminar trabajador"
        message={confirm ? `¿Eliminar a ${confirm.worker.name}? Solo permitido si no tiene días registrados.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={confirm?.busy}
        onCancel={() => !confirm?.busy && setConfirm(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}
