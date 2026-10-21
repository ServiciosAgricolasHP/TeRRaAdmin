import { useState } from "react";
import WorkersTab from "./workers/WorkersTab";
import EmploymentsTab from "./workers/EmploymentsTab";

const TABS = [
  { value: "workers", label: "👷 Trabajadores" },
  { value: "employments", label: "📄 Contratos" },
];
const TAB_KEY = "workers.tab";

const savedTab = () => {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
};

// Trabajadores: la lista de personas y sus contratos y honorarios, en
// pestañas. Abre en la última elegida.
export default function Workers() {
  const [tab, setTab] = useState(() => {
    const saved = savedTab();
    return TABS.some((t) => t.value === saved) ? saved : "workers";
  });
  const choose = (value) => {
    setTab(value);
    try { localStorage.setItem(TAB_KEY, value); } catch { /* noop */ }
  };

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Trabajadores</h1>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--color-border)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => choose(t.value)}
            className={`relative px-4 py-2 text-sm transition-colors ${
              tab === t.value ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "workers" ? <WorkersTab /> : <EmploymentsTab />}</div>
    </div>
  );
}
