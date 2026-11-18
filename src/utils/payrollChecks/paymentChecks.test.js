import { describe, expect, it } from "vitest";
import { buildCheckContext } from "./checkContext";
import { accountChanged, cuentaRutMismatch, firstPayment, missingPayee, sharedAccount, sharedAccountGroups } from "./paymentChecks";

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
  const shared = { paymentRut: "11111111-1", accountNumber: "11111111" };

  it("marca a quien cobra en la cuenta de otro, no al titular, con la cuenta", () => {
    const res = sharedAccount(ctxOf([account("11111111-1"), account("44444444-4", shared), account("22222222-2")]));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ person: "44444444-4", severity: "orange", lines: ["Cobra en la cuenta de ANA PÉREZ"] });
    expect(res[0].account).toMatchObject({ key: "012|11111111", holder: "ANA PÉREZ", holderName: "ANA PÉREZ", holderRut: "11111111-1", holderInPayroll: true });
    expect(res[0].account.label).toContain("11111111");
  });

  it("todos los que usan la misma cuenta llevan la misma", () => {
    const res = sharedAccount(ctxOf([account("11111111-1"), account("44444444-4", shared), account("22222222-2", shared)]));
    expect(res.map((r) => [r.person, r.lines[0]])).toEqual([
      ["44444444-4", "Cobra en la cuenta de ANA PÉREZ"],
      ["22222222-2", "Cobra en la cuenta de ANA PÉREZ"],
    ]);
    expect(res[0].account).toBe(res[1].account);
  });

  it("sin el titular en la nómina, lo nombra por su nombre en la ficha o por su RUT", () => {
    const other = { paymentRut: "55555555-5", accountNumber: "55555555" };
    const byRut = sharedAccount(ctxOf([account("44444444-4", other), account("22222222-2", other)]));
    expect(byRut.map((r) => r.lines[0])).toEqual(["Cobra en la cuenta de RUT 55.555.555-5", "Cobra en la cuenta de RUT 55.555.555-5"]);
    expect(byRut[0].account).toMatchObject({ holderName: "", holderRut: "55555555-5", holderInPayroll: false });
    const named = sharedAccount(ctxOf([account("44444444-4", other), account("22222222-2", { ...other, paymentName: "ROSA DÍAZ" })]));
    expect(named[0].lines[0]).toBe("Cobra en la cuenta de ROSA DÍAZ");
  });

  it("el RUT anterior del trabajador también lo hace titular", () => {
    const old = { paymentRut: "33333333-3", accountNumber: "33333333" };
    const res = sharedAccount(ctxOf([account("22222222-2", old), account("44444444-4", old)]));
    expect(res.map((r) => [r.person, r.lines[0]])).toEqual([["44444444-4", "Cobra en la cuenta de LUIS SOTO"]]);
  });
});

describe("sharedAccountGroups", () => {
  it("junta las alertas por cuenta, por el nombre del titular", () => {
    const rosa = { key: "1|9", holder: "ROSA DÍAZ" };
    const ana = { key: "1|1", holder: "ANA PÉREZ" };
    const alerts = [{ key: "a", account: rosa }, { key: "b", account: ana }, { key: "c", account: rosa }, { key: "d" }];
    expect(sharedAccountGroups(alerts).map((g) => [g.account.holder, g.alerts.map((a) => a.key)])).toEqual([
      ["ANA PÉREZ", ["b"]],
      ["ROSA DÍAZ", ["a", "c"]],
    ]);
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

  it("en efectivo no marca, aunque traiga el RUT de otra persona", () => {
    expect(missingPayee(ctxOf([account("44444444-4", { paymentRut: "11111111-1", bankCode: "EFE" })]))).toEqual([]);
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
