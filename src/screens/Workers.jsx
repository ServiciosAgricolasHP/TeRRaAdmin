import { useState } from "react";
import WorkersTab from "./workers/WorkersTab";
import EmploymentsTab from "./workers/EmploymentsTab";
import FeeListsTab from "./workers/FeeListsTab";

const TABS = [
  { value: "workers", label: "👷 Trabajadores" },
  { value: "employments", label: "📄 Contratos" },
  { value: "fees", label: "🧾 Honorarios" },
];
const TAB_CONTENT = { workers: WorkersTab, employments: EmploymentsTab, fees: FeeListsTab };
const TAB_KEY = "workers.tab";

const savedTab = () => {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
};

// Trabajadores: la lista de personas, sus contratos y honorarios, y las listas
// de honorarios, en pestañas. Abre en la última elegida.
export default function Workers() {
  const [tab, setTab] = useState(() => {
    const saved = savedTab();
    return TABS.some((t) => t.value === saved) ? saved : "workers";
  });
  const Content = TAB_CONTENT[tab];
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
      <div className="min-h-0 flex-1">
        <Content />
      </div>
    </div>
  );
}
