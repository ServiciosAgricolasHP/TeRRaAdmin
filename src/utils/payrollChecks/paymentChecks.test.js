import { describe, expect, it } from "vitest";
import { buildCheckContext } from "./checkContext";
import { accountChanged, cuentaRutMismatch, firstPayment, missingPayee, sharedAccount } from "./paymentChecks";

const workers = [
  { id: "11111111-1", rut: "11111111-1", name: "ANA PÉREZ" },
  { id: "22222222-2", rut: "22222222-2", name: "LUIS SOTO", rutHistory: ["33333333-3"] },
  { id: "44444444-4", rut: "44444444-4", name: "EVA ROJAS" },
];
const account = (rut, extra = {}) => ({
  rut,
  workerId: rut,
  name: workers.find((w) => w.id === rut)?.name || "",
  paymentRut: rut,
  bankCode: "012",
  accountType: 3,
  accountNumber: rut.split("-")[0],
  ...extra,
});
const ctxOf = (items, payrolls = []) => buildCheckContext({ items, workers, payrolls });

describe("accountChanged", () => {
  it("una cuenta distinta a la de su última nómina es roja", () => {
    const payrolls = [{ id: "p1", name: "Semana 45", createdAt: 1, items: [account("11111111-1", { bankCode: "001", accountType: 1, accountNumber: "555" })] }];
    const res = accountChanged(ctxOf([account("11111111-1")], payrolls));
    expect(res[0]).toMatchObject({ severity: "red" });
    expect(res[0].lines[0]).toMatch(/^Antes \(Semana 45\): /);
    expect(res[0].lines[1]).toContain("11111111");
  });

  it("pasar a efectivo es naranja", () => {
    const payrolls = [{ id: "p1", name: "Semana 45", createdAt: 1, items: [account("11111111-1")] }];
    const res = accountChanged(ctxOf([account("11111111-1", { bankCode: "EFE" })], payrolls));
    expect(res[0]).toMatchObject({ severity: "orange", lines: [expect.any(String), "Ahora: efectivo"] });
  });

  it("la misma cuenta, con ceros o guiones distintos, no cambió; un item antiguo se lee de bankDetails", () => {
    const old = { rut: "11111111-1", bankDetails: ["11111111-1", "0011111111", 3, "012"] };
    const payrolls = [{ id: "p1", createdAt: 1, items: [old] }];
    expect(accountChanged(ctxOf([account("11111111-1")], payrolls))).toEqual([]);
  });

  it("compara con la nómina más nueva, y sin historial no revisa", () => {
    const payrolls = [
      { id: "p1", createdAt: 1, items: [account("11111111-1", { accountNumber: "999" })] },
      { id: "p2", createdAt: 2, items: [account("11111111-1")] },
    ];
    expect(accountChanged(ctxOf([account("11111111-1")], payrolls))).toEqual([]);
    expect(accountChanged(ctxOf([account("11111111-1")]))).toEqual([]);
  });
});

describe("cuentaRutMismatch", () => {
  it("marca una Cuenta RUT con otro número", () => {
    const res = cuentaRutMismatch(ctxOf([account("11111111-1", { accountNumber: "11111112" }), account("44444444-4")]));
    expect(res).toHaveLength(1);
    expect(res[0].lines[0]).toBe("La Cuenta RUT 11111112 no es el RUT de pago 11.111.111-1");
  });

  it("no revisa otras cuentas ni el efectivo", () => {
    expect(cuentaRutMismatch(ctxOf([account("11111111-1", { accountType: 1, accountNumber: "555" }), account("44444444-4", { bankCode: "EFE" })]))).toEqual([]);
  });
});

describe("sharedAccount", () => {
  it("marca a quienes cobran en la misma cuenta", () => {
    const shared = { paymentRut: "11111111-1", accountNumber: "11111111" };
    const res = sharedAccount(ctxOf([account("11111111-1"), account("44444444-4", shared), account("22222222-2")]));
    expect(res.map((r) => r.lines[0])).toEqual(["Comparte la cuenta con EVA ROJAS", "Comparte la cuenta con ANA PÉREZ"]);
  });
});

describe("missingPayee", () => {
  it("marca la cuenta de otra persona sin titular", () => {
    const res = missingPayee(ctxOf([account("44444444-4", { paymentRut: "11111111-1" })]));
    expect(res[0].lines[0]).toBe("Cobra en la cuenta del RUT 11.111.111-1, sin titular en la ficha");
  });

  it("con titular, o con un RUT anterior de la misma persona, no marca", () => {
    expect(missingPayee(ctxOf([account("44444444-4", { paymentRut: "11111111-1", paymentName: "Ana Pérez" })]))).toEqual([]);
    expect(missingPayee(ctxOf([account("22222222-2", { paymentRut: "33333333-3" })]))).toEqual([]);
  });
});

describe("firstPayment", () => {
  it("marca a quien no está en ninguna nómina anterior", () => {
    const payrolls = [{ id: "p1", createdAt: 1, items: [account("11111111-1")] }];
    const res = firstPayment(ctxOf([account("11111111-1"), account("44444444-4")], payrolls));
    expect(res).toEqual([{ person: "44444444-4", severity: "info", lines: ["Primera vez en una nómina"] }]);
  });

  it("en el detalle, solo cuentan las nóminas creadas antes", () => {
    const payrolls = [
      { id: "p1", createdAt: 1, items: [] },
      { id: "p2", createdAt: 2, items: [account("11111111-1")] },
    ];
    const ctx = buildCheckContext({ items: [account("11111111-1")], workers, payrolls, payrollId: "p1", createdAt: 1 });
    expect(firstPayment(ctx)).toHaveLength(1);
  });
});
