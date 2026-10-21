import { useState } from "react";
import { birthdayOf, birthdayParts, daysInMonthOf, MONTH_NAMES } from "../../utils/userAccounts";

const selectClass =
  "min-h-[38px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]";

const capitalized = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// El día y el mes del cumpleaños, sin año. Avisa con `onChange("MM-DD")`, o con
// "" mientras falte el día o el mes. Arranca con `defaultValue`.
export default function BirthdayField({ defaultValue, onChange }) {
  const initial = birthdayParts(defaultValue);
  const [day, setDay] = useState(initial?.day || 0);
  const [month, setMonth] = useState(initial?.month || 0);

  const update = (d, m) => {
    setDay(d);
    setMonth(m);
    onChange(birthdayOf(d, m));
  };

  return (
    <div className="flex gap-2">
      <select
        aria-label="Día"
        value={day}
        onChange={(e) => update(Number(e.target.value), month)}
        className={`${selectClass} w-24`}
      >
        <option value={0}>Día</option>
        {Array.from({ length: daysInMonthOf(month) }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select
        aria-label="Mes"
        value={month}
        onChange={(e) => {
          const m = Number(e.target.value);
          update(day > daysInMonthOf(m) ? 0 : day, m);
        }}
        className={`${selectClass} min-w-0 flex-1`}
      >
        <option value={0}>Mes</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {capitalized(name)}
          </option>
        ))}
      </select>
    </div>
  );
}
