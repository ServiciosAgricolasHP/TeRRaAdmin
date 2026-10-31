import { describe, expect, it } from "vitest";
import { cycleShort, filterTrips, groupTripsByCarrier, sortTripsBy } from "./tripsList";

const trips = [
  { id: "t1", carrierId: "K1", status: "pending", cycleId: "C1", faenaId: "F1", subfaenaId: "S1", date: "2026-10-03", amount: 30000, qty: 2, personCount: 12, vehicleAlias: "Bus", lugar: "Fundo", destino: "Packing" },
  { id: "t2", carrierId: "K2", status: "paid", cycleId: "C2", faenaId: "F2", subfaenaId: "S2", date: "2026-10-01", amount: 15000, qty: 1, personCount: 4, vehicleAlias: "auto", lugar: "Alto", destino: "Bodega" },
  { id: "t3", carrierId: "K1", status: "paid", cycleId: "C1", faenaId: "F1", subfaenaId: "S1", date: "2026-10-05", amount: 20000, qty: 3, personCount: 8, vehicleAlias: "Camión", lugar: "Bajo", destino: "Packing" },
  { id: "t4", status: "pending", date: "2026-10-02", amount: 5000 },
];

describe("filterTrips", () => {
  it("sin filtros devuelve todas", () => {
    expect(filterTrips(trips, {}, "")).toHaveLength(4);
  });

  it("combina transportista, estado, faena y ciclo", () => {
    const ids = filterTrips(trips, { carrierId: "K1", status: "paid", faenaId: "F1", cycleId: "C1" }, "").map((t) => t.id);
    expect(ids).toEqual(["t3"]);
  });

  it("la fecha hasta incluye ese día y deja pasar las vueltas sin fecha", () => {
    const ids = filterTrips([...trips, { id: "t5", amount: 1 }], {}, "2026-10-03").map((t) => t.id);
    expect(ids).toEqual(["t1", "t2", "t4", "t5"]);
  });
});

describe("cycleShort", () => {
  it("deja el último tramo de la etiqueta", () => {
    expect(cycleShort({ label: "Fundo/Sector Uno/Ciclo 3" })).toBe("Ciclo 3");
    expect(cycleShort({ label: "Ciclo 1" })).toBe("Ciclo 1");
    expect(cycleShort(null)).toBe("");
  });
});

describe("sortTripsBy", () => {
  const maps = {
    faenaById: new Map([["F1", { name: "Robles" }], ["F2", { name: "Alamos" }]]),
    subfaenaById: new Map([["S1", { name: "Uno" }], ["S2", { name: "Dos" }]]),
  };
  const ids = (list) => list.map((t) => t.id);

  it("ordena por fecha en los dos sentidos sin tocar la lista original", () => {
    const original = [...trips];
    expect(ids(sortTripsBy(trips, { sortBy: "date", sortDir: "asc", ...maps }))).toEqual(["t2", "t4", "t1", "t3"]);
    expect(ids(sortTripsBy(trips, { sortBy: "date", sortDir: "desc", ...maps }))).toEqual(["t3", "t1", "t4", "t2"]);
    expect(trips).toEqual(original);
  });

  it("los números se comparan como números", () => {
    expect(ids(sortTripsBy(trips, { sortBy: "monto", sortDir: "asc", ...maps }))).toEqual(["t4", "t2", "t3", "t1"]);
    expect(ids(sortTripsBy(trips, { sortBy: "personas", sortDir: "desc", ...maps }))).toEqual(["t1", "t3", "t2", "t4"]);
  });

  it("el vehículo no distingue mayúsculas", () => {
    expect(ids(sortTripsBy(trips.slice(0, 3), { sortBy: "vehicle", sortDir: "asc", ...maps }))).toEqual(["t2", "t1", "t3"]);
  });

  it("faena y subfaena se ordenan por nombre", () => {
    expect(ids(sortTripsBy(trips.slice(0, 3), { sortBy: "faena", sortDir: "asc", ...maps }))).toEqual(["t2", "t1", "t3"]);
  });
});

describe("groupTripsByCarrier", () => {
  const carrierById = new Map([["K1", { alias: "Zeta", name: "Transportes Zeta" }], ["K2", { alias: "Alfa", name: "" }]]);

  it("agrupa por transportista con totales, ordenado por alias", () => {
    const groups = groupTripsByCarrier(trips, carrierById);
    expect(groups.map((g) => g.alias)).toEqual(["Alfa", "Sin transportista", "Zeta"]);
    const zeta = groups.find((g) => g.carrierId === "K1");
    expect(zeta).toMatchObject({ name: "Transportes Zeta", total: 50000, pendingCount: 1, paidCount: 1, pendingTotal: 30000 });
    expect(zeta.trips.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("un transportista que ya no existe sale con guion", () => {
    const [g] = groupTripsByCarrier([{ id: "x", carrierId: "K9", amount: 1000 }], carrierById);
    expect(g).toMatchObject({ carrierId: "K9", alias: "—", total: 1000, pendingCount: 1 });
  });
});
