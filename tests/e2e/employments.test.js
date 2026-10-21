import { describe, it, expect } from "vitest";
import {
  loadWorkedDays,
  startEmployments,
  endEmployments,
  setSettlementStatus,
  listEmploymentsFrom,
  listEmploymentsOfWorkers,
  listSettlements,
  listWorkerEmployments,
} from "../../src/services/employmentsService";
import { planStartEmployments, planEndEmployments, feeRows } from "../../src/utils/employment";
import { ANA, BETO, CARO, FAENA, all, seedCycle, seedWorkday } from "./helpers/seed";

// Contratar y terminar en bloque, como lo hacen los modales de Contratos: la
// pantalla lee los períodos de esas personas, arma el plan y lo escribe.

const people = [ANA, BETO, CARO].map((w) => ({ workerId: w.id, rut: w.id, name: w.name }));

async function contratar(list, fields) {
  const existing = await listEmploymentsOfWorkers(list.map((p) => p.workerId));
  const plan = planStartEmployments(existing, list, fields);
  const created = plan.create.length ? await startEmployments(plan.create) : [];
  return { plan, created };
}

describe("contratos en bloque", () => {
  it("contrata a varios con un solo log y los deja vigentes", async () => {
    const { created } = await contratar(people, { type: "contract", employerId: "hp", startDate: "2026-09-01" });
    expect(created).toHaveLength(3);

    const docs = await all("employments");
    expect(docs.map((d) => [d.workerId, d.type, d.employerId, d.startDate, d.endDate]).sort()).toEqual([
      [ANA.id, "contract", "hp", "2026-09-01", ""],
      [CARO.id, "contract", "hp", "2026-09-01", ""],
      [BETO.id, "contract", "hp", "2026-09-01", ""],
    ].sort());

    const logs = await all("logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "bulkStart", entity: "employment", meta: { count: 3, type: "contract", employerId: "hp", startDate: "2026-09-01" } });

    expect(await listEmploymentsFrom("2026-10-21")).toHaveLength(3);
  });

  it("no crea un período que se cruza con otro de la misma persona", async () => {
    await contratar([people[0]], { type: "contract", employerId: "hp", startDate: "2026-09-01" });
    const { plan, created } = await contratar(people.slice(0, 2), { type: "fees", employerId: "otra", startDate: "2026-10-01" });
    expect(created.map((e) => e.workerId)).toEqual([BETO.id]);
    expect(plan.skipped.map((s) => s.person.workerId)).toEqual([ANA.id]);
    expect(await all("employments")).toHaveLength(2);
  });

  it("termina varios: el contrato queda con finiquito pendiente y sale de los vigentes", async () => {
    const { created } = await contratar(people, { type: "contract", employerId: "hp", startDate: "2026-09-01" });
    const plan = planEndEmployments(created.slice(0, 2), { endDate: "2026-10-15", endReason: "jobEnd" });
    await endEmployments(plan.update, { endDate: "2026-10-15", endReason: "jobEnd" });

    const ended = (await all("employments")).filter((e) => e.endDate);
    expect(ended).toHaveLength(2);
    expect(ended.every((e) => e.endReason === "jobEnd" && e.settlementStatus === "pending")).toBe(true);
    expect((await listEmploymentsFrom("2026-10-16")).map((e) => e.workerId)).toEqual([CARO.id]);
    expect(await listEmploymentsFrom("2026-10-15")).toHaveLength(3);

    const logs = (await all("logs")).filter((l) => l.action === "bulkEnd");
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ count: 2, endDate: "2026-10-15", endReason: "jobEnd" });

    await setSettlementStatus([ended[0].id], "done", "2026-10-20");
    const settlements = await listSettlements("2026-10-01");
    expect(settlements.map((e) => [e.id, e.settlementStatus]).sort()).toEqual(
      [[ended[0].id, "done"], [ended[1].id, "pending"]].sort(),
    );

    // Con el contrato terminado, la misma persona puede pasar a honorarios.
    const again = await contratar([people[0]], { type: "fees", employerId: "hp", startDate: "2026-10-16" });
    expect(again.created).toHaveLength(1);
    expect((await listWorkerEmployments(ANA.id)).map((e) => e.type)).toEqual(["fees", "contract"]);
  });
});

describe("días trabajados para las listas", () => {
  it("lee las jornadas del rango y las cruza con los honorarios del empleador", async () => {
    await seedCycle({ dias: ["2026-03-02", "2026-03-03", "2026-03-04"] });
    await seedWorkday({ rut: ANA.id, date: "2026-03-02", amount: 20000 });
    await seedWorkday({ rut: ANA.id, date: "2026-03-03", amount: 20000 });
    await seedWorkday({ rut: BETO.id, date: "2026-03-03", amount: 20000 });
    await seedWorkday({ rut: ANA.id, date: "2026-03-09", amount: 20000 });
    await startEmployments([
      { workerId: ANA.id, workerRut: ANA.id, workerName: ANA.name, type: "fees", employerId: "hp", startDate: "2026-03-01", endDate: "", endReason: null, settlementStatus: null, notes: "" },
      { workerId: BETO.id, workerRut: BETO.id, workerName: BETO.name, type: "contract", employerId: "hp", startDate: "2026-03-01", endDate: "", endReason: null, settlementStatus: null, notes: "" },
    ]);

    const data = await loadWorkedDays("2026-03-01", "2026-03-08", [{ id: ANA.id }, { id: BETO.id }]);
    expect(data.reads).toBe(3);
    expect(data.faenaNameOf(FAENA)).toBe("Faena Uno");
    expect(feeRows(data.employments, data.worked, { employerId: "hp", from: "2026-03-01", to: "2026-03-08" })).toEqual([
      { workerId: ANA.id, faenaId: FAENA, days: 2 },
    ]);
  });
});
