import { useState } from "react";
import { useIsMobile } from "../../../hooks/useIsMobile";

// Tabla del informe de lecturas: en el teléfono, una tarjeta por fila. La
// primera columna es el nombre de la fila. Con `detail`, cada fila se abre
// para mostrar su desglose.
//
// columns: [{ key, label, render(row), align: "right" }]
export function ReportTable({ columns, rows, rowKey, detail, detailLabel = "Ver detalle" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(() => new Set());

  const toggle = (key) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!rows.length) return <p className="text-sm text-[var(--color-muted)]">Nada que mostrar con estos filtros.</p>;

  const [first, ...rest] = columns;

  if (isMobile) {
    return (
      <div className="space-y-2">
        {rows.map((row) => {
          const key = rowKey(row);
          const isOpen = open.has(key);
          return (
            <div key={key} className="rounded-md border border-[var(--color-border)] p-3">
              <div className="break-words text-sm">{first.render(row)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {rest.map((c) => (
                  <div key={c.key} className="flex justify-between gap-2">
                    <dt className="text-[var(--color-muted)]">{c.label}</dt>
                    <dd className="tabular-nums">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
              {detail ? (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                  className="mt-2 min-h-[32px] text-xs text-[var(--color-accent)]"
                >
                  {isOpen ? "▾ Ocultar" : `▸ ${detailLabel}`}
                </button>
              ) : null}
              {detail && isOpen ? <div className="mt-1">{detail(row)}</div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => {
            const key = rowKey(row);
            const isOpen = open.has(key);
            const cells = (
              <tr key={key} className="border-t border-[var(--color-border)] align-top">
                <td className="px-3 py-2">
                  <div className="flex items-start gap-1">
                    {detail ? (
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        title={isOpen ? "Ocultar" : detailLabel}
                        className="w-4 shrink-0 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    ) : null}
                    <div className="min-w-0 break-words">{first.render(row)}</div>
                  </div>
                </td>
                {rest.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-2 tabular-nums ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
            if (!detail || !isOpen) return [cells];
            return [
              cells,
              <tr key={`${key}-detail`} className="bg-[var(--color-surface-2)]">
                <td colSpan={columns.length} className="px-3 py-2 pl-8">
                  {detail(row)}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
