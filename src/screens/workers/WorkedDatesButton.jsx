import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { monthTitle } from "../../utils/contributionLists";
import { monthCells } from "../../utils/dates";
import { fmtCurrency } from "../../utils/format";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const PANEL_WIDTH = 304;

// Bajo el botón, o arriba si abajo no cabe; sin salirse por los lados.
function placeNear(r) {
  const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8));
  const below = window.innerHeight - r.bottom;
  const up = below < 320 && r.top > below;
  return { left, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
}

// El calendario de los meses de una fila, con los días trabajados marcados y
// lo ganado cada día.
function WorkedCalendar({ dates }) {
  const byDate = new Map(dates.map((d) => [d.date, d.amount]));
  const months = [...new Set(dates.map((d) => d.date.slice(0, 7)))].sort();
  const total = dates.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return (
    <div className="space-y-3">
      {months.map((month) => (
        <div key={month}>
          <div className="mb-1 text-sm font-semibold">{monthTitle(month)}</div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-[var(--color-muted)]">
            {WEEKDAYS.map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {monthCells(month).map((date, i) => {
              if (!date) return <div key={`e${i}`} />;
              const worked = byDate.has(date);
              return (
                <div
                  key={date}
                  className={`flex min-h-10 flex-col items-center justify-center rounded border ${
                    worked
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium"
                      : "border-transparent text-[var(--color-muted)]"
                  }`}
                >
                  <span className="text-xs">{Number(date.slice(8))}</span>
                  {worked && <span className="text-[9px] leading-tight tabular-nums">{fmtCurrency(byDate.get(date))}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="border-t border-[var(--color-border)] pt-2 text-xs">
        <b>{dates.length}</b> día{dates.length === 1 ? "" : "s"} trabajado{dates.length === 1 ? "" : "s"} · {fmtCurrency(total)}
      </div>
    </div>
  );
}

// 📅 de una fila de las listas de honorarios o de imposiciones: el calendario
// de sus días trabajados, flotando junto al botón. Con el mouse se abre al
// pasar por encima; un clic (o un toque, en el teléfono) lo deja abierto hasta
// tocar afuera, Escape u otro clic. Va en un portal con posición fija, como
// `RowMenu`, para que la tabla no lo recorte. No aparece si la fila no tiene
// fechas (alguien sumado a mano o una lista guardada antes de que se
// anotaran).
export default function WorkedDatesButton({ it }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const pinned = useRef(false);
  const hideTimer = useRef(null);
  const open = !!pos;

  const show = () => {
    clearTimeout(hideTimer.current);
    setPos(placeNear(btnRef.current.getBoundingClientRect()));
  };
  const close = () => {
    clearTimeout(hideTimer.current);
    pinned.current = false;
    setPos(null);
  };
  const hideSoon = (e) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPos(null), 150);
  };
  const onClick = () => {
    if (open && pinned.current) return close();
    pinned.current = true;
    show();
  };

  // Abierto, se cierra al tocar afuera, con Escape o al cambiar el tamaño de
  // la ventana; al desplazar sigue al botón, y se cierra si el botón sale de
  // la pantalla.
  useEffect(() => {
    if (!open) return;
    const shut = () => {
      clearTimeout(hideTimer.current);
      pinned.current = false;
      setPos(null);
    };
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) shut();
    };
    // El Escape es del calendario: no le llega al modal de abajo, que escucha
    // en `window`.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      shut();
    };
    const onScroll = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) shut();
      else setPos(placeNear(r));
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!it.dates?.length) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={hideSoon}
        aria-expanded={open}
        aria-label={`Días trabajados de ${it.name}`}
        className={`min-h-8 rounded px-1.5 ${open ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-surface-2)]"}`}
      >
        📅
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Días trabajados de ${it.name}`}
            onPointerEnter={() => clearTimeout(hideTimer.current)}
            onPointerLeave={hideSoon}
            style={{ ...pos, width: PANEL_WIDTH }}
            className="fixed z-[60] max-w-[calc(100vw-16px)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left text-[var(--color-text)] shadow-xl"
          >
            <div className="mb-2 truncate text-xs text-[var(--color-muted)]">{it.name}</div>
            <WorkedCalendar dates={it.dates} />
          </div>,
          document.body,
        )}
    </>
  );
}
