import { fmtCurrency, fmtNumber } from "../../../utils/format";

const selectCls =
  "min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";
const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");

// Paso 1 de importar la cosecha: el archivo, la hoja (si trae varias
// cosechas), los contratistas y con qué calidad y envase del catálogo calza
// cada combo del archivo, y si se pagan sus unidades o sus kilos.
export function FileStep({ h, catalogs }) {
  const { file, fileError, loadFile, sheet, setSheet, contractorList, contractors, toggleContractor, combos, comboMap, setCombo, rows } = h;
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-[var(--color-muted)]">El archivo de cosecha que entrega la empresa (JSON)</span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => loadFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:min-h-9 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface-2)] file:px-3 file:py-1.5 file:text-sm hover:file:bg-[var(--color-accent-soft)]"
        />
      </label>
      {fileError && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{fileError}</p>}

      {file && (
        <>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div className="font-medium break-words">{file.name || "Archivo sin nombre"}</div>
            <div className="text-xs text-[var(--color-muted)]">Formato: {file.formatLabel}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              {file.week && <span>{file.week} · </span>}
              del {fmtDate(file.period.from)} al {fmtDate(file.period.to)} · {fmtNumber(file.rows.length)} filas
              {file.status && (
                <span className={`ml-2 rounded px-1.5 py-0.5 font-medium ${file.status === "OK" ? "border border-[var(--color-success)] text-[var(--color-success)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"}`}>
                  {file.status}
                </span>
              )}
            </div>
            {file.warnings.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[var(--color-muted)]">{file.warnings.length} aviso{file.warnings.length === 1 ? "" : "s"} del script</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {file.warnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}
                </ul>
              </details>
            )}
          </div>

          {file.sheets.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">El archivo trae varias cosechas: ¿cuál va en esta labor?</span>
              <select value={sheet} onChange={(e) => setSheet(e.target.value)} className={selectCls}>
                {file.sheets.map((s) => (
                  <option key={s.sheet} value={s.sheet}>{s.sheet}{s.species.length ? ` · ${s.species.join(", ")}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="mb-1 text-sm text-[var(--color-muted)]">Contratistas: marca los que importas</legend>
            <div className="space-y-1">
              {contractorList.map((c) => (
                <label key={c.name} className="flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={contractors.has(c.name)} onChange={() => toggleContractor(c.name)} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate" title={c.name}>{c.name || "(sin contratista)"}</span>
                  <span className="shrink-0 text-xs text-[var(--color-muted)]">{c.people} persona{c.people === 1 ? "" : "s"} · {fmtNumber(c.rows)} filas</span>
                </label>
              ))}
            </div>
          </fieldset>

          {rows.length > 0 && (
            <div>
              <div className="mb-1 text-sm text-[var(--color-muted)]">Con qué calidad y envase del catálogo calza cada combo del archivo, y si se pagan sus unidades o sus kilos</div>
              <div className="space-y-2">
                {combos.map((c) => {
                  const m = comboMap[c.key] || {};
                  const missing = m.x == null || m.y == null;
                  return (
                    <div key={c.key} className={`rounded-lg border p-2.5 text-sm ${missing ? "border-[var(--color-warning)]" : "border-[var(--color-border)]"}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="font-medium">{[c.species, c.quality, c.container].filter(Boolean).join(" · ") || "(sin combo)"}</span>
                        <span className="text-xs text-[var(--color-muted)]">
                          {fmtNumber(c.units)} unidades · {fmtNumber(c.kilos)} kg
                          {c.prices.length > 0 && ` · la empresa paga ${c.prices.map(fmtCurrency).join(" / ")}`}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select aria-label="Calidad" value={m.x ?? ""} onChange={(e) => setCombo(c.key, { x: e.target.value === "" ? null : Number(e.target.value) })} className={selectCls}>
                          <option value="">Calidad…</option>
                          {(catalogs?.qualities || []).map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                        </select>
                        <select aria-label="Envase" value={m.y ?? ""} onChange={(e) => setCombo(c.key, { y: e.target.value === "" ? null : Number(e.target.value) })} className={selectCls}>
                          <option value="">Envase…</option>
                          {(catalogs?.containers || []).map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                        </select>
                        <select aria-label="Se paga por" value={m.measure} onChange={(e) => setCombo(c.key, { measure: e.target.value })} className={selectCls}>
                          <option value="units">Por unidad del envase</option>
                          <option value="kilos">Por kilo</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {file && rows.length === 0 && <p className="text-sm text-[var(--color-muted)]">Marca al menos un contratista.</p>}
        </>
      )}
    </div>
  );
}
