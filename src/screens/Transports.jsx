import { useState } from "react";
import { CarriersTab } from "./transports/CarriersTab";
import { FaenaBatchTab } from "./transports/FaenaBatchTab";
import { PaymentsTab } from "./transports/PaymentsTab";
import { FortnightsTab } from "./transports/FortnightsTab";
import { TripsTab } from "./transports/TripsTab";

const TABS = [
  { value: "carriers", label: "Transportistas" },
  { value: "trips", label: "Vueltas" },
  { value: "byFaena", label: "Pago por faena" },
  { value: "payments", label: "Resúmenes" },
  { value: "fortnights", label: "Quincenas" },
];

export default function Transports() {
  const [tab, setTab] = useState("carriers");
  // Transportista al que salta "Vueltas" desde una tarjeta de "Transportistas".
  // TripsTab lo lee una sola vez al montar (`initialCarrierId`); un click en
  // cualquier pestaña del nav lo limpia.
  const [tripsCarrierPreset, setTripsCarrierPreset] = useState(null);

  const openCarrierTrips = (carrier) => {
    setTripsCarrierPreset(carrier);
    setTab("trips");
  };

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Transportes</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setTripsCarrierPreset(null);
              setTab(t.value);
            }}
            className={`relative px-4 py-2 text-sm transition-colors ${
              tab === t.value ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        ))}
      </div>

      {tab === "carriers" && <CarriersTab onViewTrips={openCarrierTrips} />}
      {tab === "trips" && <TripsTab initialCarrierId={tripsCarrierPreset?.id || null} />}
      {tab === "byFaena" && <FaenaBatchTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "fortnights" && <FortnightsTab />}
    </div>
  );
}
