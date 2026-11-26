import { describe, expect, it, vi } from "vitest";
import { MAX_DOC_BYTES } from "./docSizes";

// El reparto de los anticipos (`payrollPreview`) usa `advancesService`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { newPayrollDocs, newPayrollWeight } = await import("./newPayroll");

const cycle = { id: "c1", label: "Ciclo Uno", faenaId: "f1", subfaenaId: "s1", labors: [{ id: "cos", name: "Cosecha", type: "cosecha" }], dayPrices: {} };
const wd = (rut, i) => ({
  id: `c1__cos__${rut}__2026-12-${String((i % 28) + 1).padStart(2, "0")}__${i % 3}`,
  cycleId: "c1",
  laborId: "cos",
  workerRut: rut,
  date: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
  qty: 120,
  amount: 18000,
  qualityX: i % 3,
  containerY: 1,
});
const rutOf = (n) => `${10000000 + n}-${n % 10}`;

// Una vista previa de temporada alta: `people` personas con `days` jornadas
// cada una.
function preview(people, days) {
  const workdays = [];
  const items = Array.from({ length: people }, (_, n) => {
    const rut = rutOf(n);
    const own = Array.from({ length: days }, (_, i) => wd(rut, i));
    workdays.push(...own);
    return {
      include: true,
      rut,
      workerId: rut,
      name: `Persona de Prueba Número ${n}`,
      paymentRut: rut,
      accountNumber: "000123456789",
      bankCode: "012",
      accountType: 3,
      email: `persona${n}@terra.test`,
      groupLeader: "GRUPO NORTE",
      grossAmount: days * 18000,
      amount: days * 18000,
      byCycle: { c1: days * 18000 },
      workdayIds: own.map((w) => w.id),
    };
  });
  return { items, workdays };
}

const docsOf = ({ items, workdays }, extra = {}) =>
  newPayrollDocs({
    items,
    cycles: [cycle],
    chosenCycles: new Map([["c1", true]]),
    workdays,
    advances: [],
    name: "Semana 50",
    bankFormatId: "pagoFacilBchile",
    classification: "nomina",
    generatedAt: "2026-12-14T12:00:00.000Z",
    ...extra,
  });

describe("newPayrollDocs", () => {
  it("arma la nómina y su JSON con las filas incluidas, sin la lista de jornadas aparte", () => {
    const data = preview(2, 3);
    const extra = { ...wd("99999999-9", 0), id: "ajena" };
    const { payroll, snapshot, workdayIds } = docsOf({ ...data, workdays: [...data.workdays, extra] });
    expect(payroll).toMatchObject({ name: "Semana 50", status: "pending", cycleIds: ["c1"], workerCount: 2, total: 2 * 3 * 18000, hasSnapshot: true });
    expect(payroll).not.toHaveProperty("workdayIds");
    expect(payroll).not.toHaveProperty("reviewedChecks");
    expect(workdayIds).toHaveLength(6);
    expect(snapshot.workdays.map((w) => w.id)).toEqual(data.workdays.map((w) => w.id));
    expect(snapshot.cycles[0]).toMatchObject({ id: "c1", labors: [{ id: "cos", name: "Cosecha" }] });
    expect(snapshot.cycles[0]).not.toHaveProperty("laborIds");
    expect(snapshot.generatedAt).toBe("2026-12-14T12:00:00.000Z");
  });

  it("guarda los anticipos y bonos sugeridos que la nómina deja fuera, solo si hay", () => {
    const data = preview(2, 1);
    expect(docsOf(data).payroll).not.toHaveProperty("skippedAdvanceIds");
    const [ana, beto] = data.items;
    const items = [
      // Su cuota se desmarcó al guardar: estaba sugerida y no quedó.
      { ...ana, allocatedAdvances: [{ advanceId: "cuota", amount: 5000 }], anticipoApplications: [] },
      // El bono se aplica y el anticipo se bajó a $0 en la vista previa.
      {
        ...beto,
        allocatedAdvances: [{ advanceId: "ant", amount: 3000 }],
        allocatedBonuses: [{ advanceId: "bono", amount: 2000 }],
        anticipoApplications: [],
        bonoApplications: [{ advanceId: "bono", amount: 2000 }],
      },
    ];
    expect(docsOf({ ...data, items }).payroll.skippedAdvanceIds).toEqual(["cuota", "ant"]);
  });

  it("guarda las revisadas solo si hay", () => {
    const reviewedChecks = [{ keys: ["firstPayment|1-9"], by: "u1" }];
    expect(docsOf(preview(1, 1), { reviewedChecks }).payroll.reviewedChecks).toEqual(reviewedChecks);
  });
});

describe("newPayrollWeight", () => {
  it("una nómina de 250 personas y 3.000 jornadas cabe con holgura", () => {
    const weight = newPayrollWeight(docsOf(preview(250, 12)));
    expect(weight.status).toBe("ok");
    expect(weight.share).toBeGreaterThan(0.1);
    expect(weight.share).toBeLessThan(0.5);
    expect(weight.bytes).toBe(Math.max(weight.payroll, weight.json));
  });

  it("las jornadas del JSON no cuentan, porque van en partes; las de las personas sí", () => {
    const docs = docsOf(preview(50, 10));
    const doubled = { ...docs, snapshot: { ...docs.snapshot, workdays: [...docs.snapshot.workdays, ...docs.snapshot.workdays] } };
    expect(newPayrollWeight(doubled).json).toBe(newPayrollWeight(docs).json);
    expect(newPayrollWeight(docsOf(preview(50, 20))).payroll).toBeGreaterThan(newPayrollWeight(docs).payroll);
  });

  it("marca cerca y fuera del límite", () => {
    const near = newPayrollWeight(docsOf(preview(250, 100)));
    const over = newPayrollWeight(docsOf(preview(250, 130)));
    expect(near.status).toBe("near");
    expect(over.status).toBe("over");
    expect(over.bytes).toBeGreaterThan(MAX_DOC_BYTES);
  });
});
