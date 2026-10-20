import { useState, useEffect } from "react";
import Modal from "../../components/Modal";
import Select from "../../components/Select";

// ============================================================
// Subcomponentes
// ============================================================

export function AddComboModal({ open, onClose, catalogs, existingCombos, date, onAdd, onAddCatalogEntry }) {
  const qualities = catalogs.qualities || [];
  const containers = catalogs.containers || [];
  const [x, setX] = useState(qualities[0]?.value ?? 0);
  const [y, setY] = useState(containers[0]?.value ?? 0);
  const [newQuality, setNewQuality] = useState("");
  const [newContainer, setNewContainer] = useState("");
  const [showNewQ, setShowNewQ] = useState(false);
  const [showNewC, setShowNewC] = useState(false);

  useEffect(() => {
    if (open) {
      setX(qualities[0]?.value ?? 0);
      setY(containers[0]?.value ?? 0);
      setNewQuality(""); setNewContainer("");
      setShowNewQ(false); setShowNewC(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const existingKeys = new Set(existingCombos.map((c) => c.key));
  const targetKey = `${x}_${y}`;
  const duplicate = existingKeys.has(targetKey);

  const handleAddQuality = async () => {
    if (!newQuality.trim()) return;
    const newVal = await onAddCatalogEntry("qualities", newQuality);
    if (newVal != null) setX(newVal);
    setNewQuality(""); setShowNewQ(false);
  };

  const handleAddContainer = async () => {
    if (!newContainer.trim()) return;
    const newVal = await onAddCatalogEntry("containers", newContainer);
    if (newVal != null) setY(newVal);
    setNewContainer(""); setShowNewC(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Agregar tipo de cosecha · ${date || ""}`}>
      <div className="space-y-4">
        <div>
          <Select
            label="Calidad" value={x} onChange={(v) => setX(Number(v))}
            options={qualities.map((q) => ({ value: q.value, label: q.label }))}
          />
          {!showNewQ ? (
            <button type="button" onClick={() => setShowNewQ(true)} className="mt-1 text-xs text-[var(--color-accent)] hover:underline">
              + Nueva calidad
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={newQuality} onChange={(e) => setNewQuality(e.target.value)}
                placeholder="Ej: Premium"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <button type="button" onClick={handleAddQuality} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)]">
                Agregar
              </button>
              <button type="button" onClick={() => setShowNewQ(false)} className="text-xs text-[var(--color-muted)]">
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div>
          <Select
            label="Envase / unidad" value={y} onChange={(v) => setY(Number(v))}
            options={containers.map((c) => ({ value: c.value, label: c.label }))}
          />
          {!showNewC ? (
            <button type="button" onClick={() => setShowNewC(true)} className="mt-1 text-xs text-[var(--color-accent)] hover:underline">
              + Nuevo envase
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={newContainer} onChange={(e) => setNewContainer(e.target.value)}
                placeholder="Ej: caja"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <button type="button" onClick={handleAddContainer} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)]">
                Agregar
              </button>
              <button type="button" onClick={() => setShowNewC(false)} className="text-xs text-[var(--color-muted)]">
                Cancelar
              </button>
            </div>
          )}
        </div>

        {duplicate && (
          <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1 text-xs text-[var(--color-warning)]">
            Este combo ya existe para este día.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </button>
          <button
            onClick={() => onAdd(x, y)}
            disabled={duplicate}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            Agregar tipo
          </button>
        </div>
      </div>
    </Modal>
  );
}
