import { describe, it, expect } from "vitest";
import { isUnpricedTrip, unpricedTripsByCarrier } from "./unpricedTrips";

const trip = (id, carrierId, date, rate, extra = {}) => ({ id, carrierId, date, rate, qty: 1, status: "pending", ...extra });
const carriers = [
  { id: "own", alias: "Propio", type: "own" },
  { id: "sur", alias: "Furgón Sur", type: "contracted" },
  { id: "azul", alias: "Azul", type: undefined },
];

describe("isUnpricedTrip", () => {
  it("sin precio es tarifa 0 o vacía, y solo si no está pagada", () => {
    expect([0, "", null, undefined, "0", 15000].map((rate) => isUnpricedTrip(trip("t", "sur", "", rate)))).toEqual([true, true, true, true, true, false]);
    expect(isUnpricedTrip(trip("t", "sur", "", 0, { status: "paid" }))).toBe(false);
  });
});

describe("unpricedTripsByCarrier", () => {
  it("agrupa por transportista contratado, por alias y por fecha; deja fuera los propios", () => {
    const groups = unpricedTripsByCarrier([
      trip("a", "sur", "2026-10-09", 0),
      trip("b", "own", "2026-10-01", 0),
      trip("c", "sur", "2026-10-02", 0, { paymentId: "P" }),
      trip("d", "azul", "2026-10-05", ""),
      trip("e", "sur", "2026-10-03", 15000),
    ], carriers);
    expect(groups.map((g) => [g.carrierId, g.trips.map((t) => t.id)])).toEqual([["azul", ["d"]], ["sur", ["c", "a"]]]);
  });

  it("un transportista que ya no existe cuenta como contratado", () => {
    const [g] = unpricedTripsByCarrier([trip("a", "borrado", "2026-10-01", 0)], carriers);
    expect([g.carrierId, g.carrier]).toEqual(["borrado", null]);
  });
});
