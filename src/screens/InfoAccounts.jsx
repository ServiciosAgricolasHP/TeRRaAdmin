import { useEffect, useMemo, useRef, useState } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../utils/imageCapture";
import ConfirmDialog from "../components/ConfirmDialog";
import { contactCardsService } from "../services";
import { useToast } from "../contexts/ToastContext";
import { DEFAULT_BANK_CODE } from "../utils/banks";
import { normalizeRut } from "../utils/rutUtils";
import { toTitleName, unshout } from "../utils/textCase";
import { cardMatchesSearch, emptyCard, newAccountId } from "../utils/contactCards";
import ContactCard from "./infoAccounts/ContactCard";
import ContactCardImage from "./infoAccounts/ContactCardImage";
import ContactCardModal from "./infoAccounts/ContactCardModal";

// Módulo "Información y Cuentas": libreta compartida de fichas (persona o
// empresa) con datos de contacto + varias cuentas bancarias. Pensada para
// tener a mano datos que se copian seguido (ej. pegar los datos de una
// transferencia en WhatsApp). Todo es compartido entre usuarios (favoritos
// incluidos, guardados en el propio doc).

// La lista se cachea 10 minutos en memoria; guardar, borrar y marcar favorita
// la actualizan en su lugar (`additive`), sin releer la colección.
const LIST_OPTS = { order: ["name", "asc"], cache: true, ttl: 10 * 60 * 1000 };

const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" });

export default function InfoAccounts() {
  const toast = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // card en edición/creación
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Captura de imagen a pedido: se monta fuera de pantalla solo la tarjeta
  // elegida, el efecto la captura y limpia el estado.
  const [imageExport, setImageExport] = useState(null); // { card }
  const imageRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await contactCardsService.list(LIST_OPTS);
      setCards(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copy = async (text, label = "Dato") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  // Captura la tarjeta estilizada off-screen y la copia al portapapeles. Si el
  // navegador no soporta copiar imágenes (algunos móviles), cae a descarga.
  useEffect(() => {
    if (!imageExport) return;
    let cancelled = false;
    (async () => {
      // Dos rAF para asegurar que el nodo off-screen ya está en layout.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled || !imageRef.current) return;
      const node = imageRef.current;
      const download = async () => {
        const dataUrl = await captureFullWidthDataUrl(node, { pixelRatio: 2, cacheBust: true });
        const a = document.createElement("a");
        a.download = `ficha_${(imageExport.card.name || "ficha").replace(/\s+/g, "_")}.png`;
        a.href = dataUrl;
        a.click();
        toast.success("Imagen descargada");
      };
      const copyToClipboard = async () => {
        const blob = await captureFullWidthBlob(node, { pixelRatio: 2, cacheBust: true });
        if (!blob) throw new Error("blob vacío");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Imagen copiada al portapapeles");
      };
      try {
        const canCopyImage =
          typeof ClipboardItem !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.write === "function";
        if (!canCopyImage) {
          await download();
        } else {
          // Si copiar falla, descarga.
          await copyToClipboard().catch(download);
        }
      } catch {
        toast.error("No se pudo generar la imagen");
      } finally {
        if (!cancelled) setImageExport(null);
      }
    })();
    return () => { cancelled = true; };
  }, [imageExport, toast]);

  const toggleFavorite = async (card) => {
    // Actualización optimista para que la tarjeta salte de sección al instante.
    const next = !card.favorite;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, favorite: next } : c)));
    try {
      await contactCardsService.update(card.id, { favorite: next }, { additive: true });
    } catch {
      toast.error("No se pudo actualizar el favorito");
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, favorite: card.favorite } : c)));
    }
  };

  const saveCard = async (draft) => {
    const payload = {
      type: draft.type,
      // Nombre como título y nota sin gritar (utils/textCase.js). El titular de
      // cada cuenta y el giro quedan tal cual: se copian al banco y al SII.
      name: toTitleName(draft.name || ""),
      rut: draft.rut ? normalizeRut(draft.rut) : "",
      includeRut: draft.type === "persona" ? !!draft.includeRut : true,
      phone: (draft.phone || "").trim(),
      email: (draft.email || "").trim(),
      address: (draft.address || "").trim(),
      giro: draft.type === "empresa" ? (draft.giro || "").trim() : "",
      note: unshout((draft.note || "").trim()),
      favorite: !!draft.favorite,
      accounts: (draft.accounts || []).map((a) => ({
        id: a.id || newAccountId(),
        label: (a.label || "").trim(),
        titular: (a.titular || "").trim(),
        rutTitular: a.rutTitular ? normalizeRut(a.rutTitular) : "",
        bankCode: a.bankCode || DEFAULT_BANK_CODE,
        accountType: Number(a.accountType),
        accountNumber: (a.accountNumber || "").trim(),
        email: (a.email || "").trim(),
      })),
    };
    const saved = draft.id
      ? await contactCardsService.update(draft.id, payload, { additive: true })
      : await contactCardsService.create(payload, { additive: true });
    setCards((prev) => [...prev.filter((c) => c.id !== saved.id), saved]);
    setEditing(null);
    toast.success("Ficha guardada");
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const c = confirmDelete;
    setDeleteBusy(true);
    try {
      await contactCardsService.remove(c.id, { additive: true });
      setCards((prev) => prev.filter((x) => x.id !== c.id));
      setConfirmDelete(null);
      toast.success("Ficha eliminada");
    } catch (err) {
      toast.error("No se pudo eliminar: " + (err.message || err));
    } finally {
      setDeleteBusy(false);
    }
  };

  // El buscador filtra también las favoritas. El orden por nombre se arma acá
  // porque una ficha recién guardada entra al final de la lista.
  const matching = useMemo(() => cards.filter((c) => cardMatchesSearch(c, search)).sort(byName), [cards, search]);
  const favorites = useMemo(() => matching.filter((c) => c.favorite), [matching]);
  const rest = useMemo(() => matching.filter((c) => !c.favorite), [matching]);
  const searching = !!search.trim();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Información y Cuentas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Fichas de personas y empresas con sus datos bancarios, listas para copiar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(emptyCard("persona"))}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          + Nueva ficha
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-muted)]">
          Todavía no hay fichas. Crea la primera con “+ Nueva ficha”.
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RUT, titular, N° de cuenta…"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />

          {/* Favoritas */}
          {favorites.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted)]">
                ⭐ Favoritas
                <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">{favorites.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {favorites.map((c) => (
                  <ContactCard
                    key={c.id}
                    card={c}
                    onCopy={copy}
                    onCopyImage={(card) => setImageExport({ card })}
                    onToggleFavorite={toggleFavorite}
                    onEdit={setEditing}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Resto */}
          <section>
            {rest.length === 0 ? (
              // Buscando, el aviso sale solo si tampoco hay favoritas que calcen.
              (!searching || favorites.length === 0) && (
                <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
                  {searching ? "Sin resultados para la búsqueda." : "No hay fichas sin marcar como favoritas."}
                </div>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((c) => (
                  <ContactCard
                    key={c.id}
                    card={c}
                    onCopy={copy}
                    onCopyImage={(card) => setImageExport({ card })}
                    onToggleFavorite={toggleFavorite}
                    onEdit={setEditing}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Nodo off-screen para capturar la imagen de la tarjeta elegida. */}
      {imageExport && (
        <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
          <ContactCardImage ref={imageRef} card={imageExport.card} />
        </div>
      )}

      {editing && (
        <ContactCardModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={saveCard}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar ficha"
        message={confirmDelete ? `¿Eliminar la ficha "${confirmDelete.name || "(sin nombre)"}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        danger
        busy={deleteBusy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

