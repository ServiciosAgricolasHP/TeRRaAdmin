import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  untagWorkdaysFromPayroll,
  recalcPayrollAggregates,
} from "../../src/services/payrollsService";
import {
  listPendingForWorkers,
  applyAdvancesToPayroll,
  restoreAdvancesFromPayroll,
} from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import {
  saveSnapshot,
  deleteSnapshot,
  readSnapshot,
} from "../../src/services/payrollSnapshots";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { allocateAdvances } from "../../src/utils/payrollItem";
import {
  ANA,
  BETO,
  CARO,
  CICLO,
  seedEscenarioNomina,
  seedAdvance,
  laborTypes,
  get,
  all,
} from "./helpers/seed";

// Arma una nómina como lo hace la pantalla, pero por la capa de servicios:
// leer workdays → agregar por trabajador → repartir anticipos y bonos →
// guardar → etiquetar workdays → aplicar anticipos.
async function generarNomina({ nombre = "Nómina de prueba" } = {}) {
  const workdays = (await workdaysService.list({ wheres: [["cycleId", "==", CICLO]] })).filter(
    (wd) => !wd.payrollId,
  );
  const aggregates = aggregateWorkerAmounts(workdays, laborTypes());
  const pendientes = await listPendingForWorkers(aggregates.map((a) => a.rut));

  const porRut = new Map();
  for (const adv of pendientes) {
    const e = porRut.get(adv.workerRut) || { anticipos: [], bonos: [] };
    (adv.type === "bono" ? e.bonos : e.anticipos).push(adv);
    porRut.set(adv.workerRut, e);
  }

  const items = [];
  for (const a of aggregates) {
    const w = await get("worker", a.rut);
    const adv = porRut.get(a.rut) || { anticipos: [], bonos: [] };
    const reparto = allocateAdvances({ gross: a.total, ...adv });
    items.push({
      rut: a.rut,
      workerId: a.workerId,
      name: w?.name || "",
      bankCode: w?.bankDetails?.[3] || "",
      grossAmount: Math.round(a.total),
      advance: reparto.anticiposTotal,
      bonus: reparto.bonosTotal,
      amount: reparto.amount,
      workdayIds: a.workdayIds,
      advanceIds: [...reparto.anticipoApplications, ...reparto.bonoApplications].map(
        (x) => x.advanceId,
      ),
      anticipoApplications: reparto.anticipoApplications,
      bonoApplications: reparto.bonoApplications,
    });
  }

  const agg = recalcPayrollAggregates(items);
  const nomina = await payrollsService.create({
    name: nombre,
    status: "pending",
    cycleIds: [CICLO],
    ...agg,
  });

  const aplicaciones = items.flatMap((it) => [
    ...it.anticipoApplications,
    ...it.bonoApplications,
  ]);
  await tagWorkdaysWithPayroll(agg.workdayIds, nomina.id);
  await applyAdvancesToPayroll(aplicaciones, nomina.id);
  // La pantalla escribe además el snapshot inmutable, que es el contrato que
  // consume el portal público de trabajadores.
  await saveSnapshot(nomina.id, {
    payrollId: nomina.id,
    name: nombre,
    cycleIds: [CICLO],
    items,
    generatedAt: "2026-03-31T12:00:00.000Z",
  });
  return { nomina: await get("payrolls", nomina.id), items, aplicaciones };
}

async function borrarNomina(id) {
  const p = await get("payrolls", id);
  await untagWorkdaysFromPayroll(p.workdayIds || []);
  await restoreAdvancesFromPayroll(p.advanceIds || [], id);
  await deleteSnapshot(id);
  await payrollsService.remove(id);
}

describe("ciclo completo de nómina", () => {
  it("genera, etiqueta y cuadra los totales", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();

    // Los tres trabajadores entraron con su bruto.
    expect(nomina.workerCount).toBe(3);
    expect(nomina.total).toBe(100000 + 50000 + 30000);

    // La invariante de totales.
    expect(nomina.bankTotal + nomina.cashTotal).toBe(nomina.total);
    expect(nomina.cashTotal).toBe(50000); // Beto, el único de efectivo
    // Caro no tiene banco cargado y NO se asume efectivo: cae del lado de
    // transferencia, donde después se marca como dato faltante.
    expect(nomina.bankTotal).toBe(100000 + 30000);
    expect(nomina.bankCount).toBe(2);
    expect(nomina.cashCount).toBe(1);

    // Todos los workdays quedaron etiquetados.
    const workdays = await all("workdays");
    expect(workdays).toHaveLength(4);
    for (const wd of workdays) expect(wd.payrollId).toBe(nomina.id);
    expect(nomina.workdayIds.sort()).toEqual(workdays.map((w) => w.id).sort());
  });

  it("descuenta el anticipo y lo deja aplicado", async () => {
    await seedEscenarioNomina();
    await seedAdvance("adv-1", { rut: ANA.id, amount: 30000 });

    const { nomina } = await generarNomina();
    const item = nomina.items.find((i) => i.rut === ANA.id);
    expect(item.grossAmount).toBe(100000);
    expect(item.advance).toBe(30000);
    expect(item.amount).toBe(70000);

    const adv = await get("advances", "adv-1");
    expect(adv.status).toBe("applied");
    expect(adv.amountPaid).toBe(30000);
    expect(adv.payments).toHaveLength(1);
    expect(adv.payments[0]).toMatchObject({ payrollId: nomina.id, amount: 30000 });
  });

  it("un anticipo más grande que el bruto queda parcial", async () => {
    await seedEscenarioNomina();
    await seedAdvance("adv-1", { rut: BETO.id, amount: 200000 });

    const { nomina } = await generarNomina();
    const item = nomina.items.find((i) => i.rut === BETO.id);
    expect(item.advance).toBe(50000); // capado por el bruto
    expect(item.amount).toBe(0);

    const adv = await get("advances", "adv-1");
    expect(adv.status).toBe("partial");
    expect(adv.amountPaid).toBe(50000);
  });

  it("el bono engrosa la base y deja el anticipo liquidado", async () => {
    // El caso que documenta AGENTS.md, ahora de punta a punta.
    await seedEscenarioNomina();
    await seedAdvance("bono-1", { rut: ANA.id, amount: 24000, type: "bono" });
    await seedAdvance("adv-1", { rut: ANA.id, amount: 124000 });

    const { nomina } = await generarNomina();
    const item = nomina.items.find((i) => i.rut === ANA.id);
    expect(item.bonus).toBe(24000);
    expect(item.advance).toBe(124000); // 100.000 de bruto + 24.000 de bono
    expect(item.amount).toBe(0);

    expect((await get("advances", "adv-1")).status).toBe("applied");
    expect((await get("advances", "bono-1")).status).toBe("applied");
  });

  // ─────────────────────────────────────────────────────────────────────
  // La vuelta: borrar la nómina tiene que dejar todo como estaba.
  // ─────────────────────────────────────────────────────────────────────
  it("borrarla devuelve los workdays al pool y restaura el anticipo", async () => {
    await seedEscenarioNomina();
    await seedAdvance("adv-1", { rut: ANA.id, amount: 30000 });

    const antesWorkdays = await all("workdays");
    const antesAdv = await get("advances", "adv-1");

    const { nomina } = await generarNomina();
    await borrarNomina(nomina.id);

    expect(await get("payrolls", nomina.id)).toBe(null);

    const despuesWorkdays = await all("workdays");
    expect(despuesWorkdays).toHaveLength(antesWorkdays.length);
    for (const wd of despuesWorkdays) {
      expect(wd.payrollId).toBe(null);
      expect(wd.paidAt).toBe(null);
    }

    const despuesAdv = await get("advances", "adv-1");
    expect(despuesAdv.status).toBe(antesAdv.status);
    expect(despuesAdv.amountPaid).toBe(antesAdv.amountPaid);
    expect(despuesAdv.payments).toEqual([]);
  });

  it("después de borrar, la producción vuelve a entrar en una nómina nueva", async () => {
    await seedEscenarioNomina();
    const primera = await generarNomina({ nombre: "Primera" });
    await borrarNomina(primera.nomina.id);

    const segunda = await generarNomina({ nombre: "Segunda" });
    expect(segunda.nomina.total).toBe(primera.nomina.total);
    expect(segunda.nomina.workerCount).toBe(3);
  });

  it("no se paga dos veces: los workdays etiquetados no entran en otra nómina", async () => {
    await seedEscenarioNomina();
    const primera = await generarNomina({ nombre: "Primera" });
    expect(primera.nomina.workerCount).toBe(3);

    // Sin borrar la primera, armar otra sobre el mismo ciclo.
    const workdaysLibres = (
      await workdaysService.list({ wheres: [["cycleId", "==", CICLO]] })
    ).filter((wd) => !wd.payrollId);
    expect(workdaysLibres).toEqual([]);
  });

  it("un trabajador sin producción no aparece en la nómina", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();
    expect(nomina.items.map((i) => i.rut)).not.toContain("99999999-9");
    expect(nomina.items).toHaveLength(3);
  });

  it("la suma de workdayIds de los items es la de la nómina", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();
    const deItems = nomina.items.flatMap((i) => i.workdayIds).sort();
    expect([...nomina.workdayIds].sort()).toEqual(deItems);
  });
});

describe("anticipo en cuotas a lo largo de varias nóminas", () => {
  it("va de pending a partial a applied, y el borrado lo devuelve exacto", async () => {
    await seedEscenarioNomina();
    // 3 cuotas de 33.334 sobre 100.000 (ceil, por eso la última es más chica).
    await seedAdvance("adv-cuotas", {
      rut: ANA.id,
      amount: 100000,
      installments: { count: 3, amount: 33334, cadence: "porPago" },
    });

    const n1 = await generarNomina({ nombre: "N1" });
    let adv = await get("advances", "adv-cuotas");
    expect(adv.status).toBe("partial");
    expect(adv.amountPaid).toBe(33334);
    expect(n1.nomina.items.find((i) => i.rut === ANA.id).advance).toBe(33334);

    await borrarNomina(n1.nomina.id);
    adv = await get("advances", "adv-cuotas");
    expect(adv.status).toBe("pending");
    expect(adv.amountPaid).toBe(0);
    expect(adv.payments).toEqual([]);
  });

  it("la última cuota se clippea al saldo y cierra la deuda", async () => {
    await seedEscenarioNomina();
    await seedAdvance("adv-cuotas", {
      rut: ANA.id,
      amount: 100000,
      amountPaid: 66668,
      status: "partial",
      payments: [
        { payrollId: "vieja-1", amount: 33334, paidAt: "2026-02-01T00:00:00.000Z" },
        { payrollId: "vieja-2", amount: 33334, paidAt: "2026-02-15T00:00:00.000Z" },
      ],
      installments: { count: 3, amount: 33334, cadence: "porPago" },
    });

    const { nomina } = await generarNomina();
    expect(nomina.items.find((i) => i.rut === ANA.id).advance).toBe(33332);

    const adv = await get("advances", "adv-cuotas");
    expect(adv.amountPaid).toBe(100000);
    expect(adv.status).toBe("applied");
  });

  it("restaurar solo saca los pagos de ESTA nómina", async () => {
    await seedEscenarioNomina();
    await seedAdvance("adv-cuotas", {
      rut: ANA.id,
      amount: 100000,
      amountPaid: 33334,
      status: "partial",
      payments: [{ payrollId: "vieja-1", amount: 33334, paidAt: "2026-02-01T00:00:00.000Z" }],
      installments: { count: 3, amount: 33334, cadence: "porPago" },
    });

    const { nomina } = await generarNomina();
    expect((await get("advances", "adv-cuotas")).amountPaid).toBe(66668);

    await borrarNomina(nomina.id);
    const adv = await get("advances", "adv-cuotas");
    expect(adv.amountPaid).toBe(33334); // el pago viejo sobrevive
    expect(adv.payments).toHaveLength(1);
    expect(adv.payments[0].payrollId).toBe("vieja-1");
    expect(adv.status).toBe("partial");
  });
});

describe("snapshot inmutable de la nómina", () => {
  it("generar la nómina deja el snapshot escrito", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina({ nombre: "Con snapshot" });

    const snap = await get("payrollSnapshots", nomina.id);
    expect(snap).toBeTruthy();
    expect(snap.payrollId).toBe(nomina.id);
    expect(snap.items).toHaveLength(3);
  });

  it("el snapshot vive en su propia colección, no adentro de la nómina", async () => {
    // Están separados para no inflar los docs del historial, que se listan
    // enteros en cada carga de la pantalla.
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();

    const doc = await get("payrolls", nomina.id);
    // El campo ni siquiera existe: no es que esté vacío.
    expect(doc.snapshot).toBeUndefined();
  });

  it("borrar la nómina se lleva el snapshot", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();
    expect(await get("payrollSnapshots", nomina.id)).toBeTruthy();

    await borrarNomina(nomina.id);

    expect(await get("payrollSnapshots", nomina.id)).toBe(null);
    expect(await get("payrolls", nomina.id)).toBe(null);
  });

  it("borrar una nómina sin snapshot no falla", async () => {
    // El snapshot es un derivado: que no esté no puede trabar el borrado,
    // que es lo que libera los workdays y restaura los anticipos.
    await seedEscenarioNomina();
    const p = await payrollsService.create({ name: "Sin snapshot", status: "pending", items: [] });
    await expect(borrarNomina(p.id)).resolves.not.toThrow();
    expect(await get("payrolls", p.id)).toBe(null);
  });
});

describe("volver a leer el snapshot", () => {
  it("lo devuelve sin el id que inyecta Firestore", async () => {
    // El JSON que se descarga es contrato externo: un campo de más lo ensucia.
    await seedEscenarioNomina();
    const { nomina } = await generarNomina();

    const snap = await readSnapshot({ id: nomina.id });
    expect(snap.payrollId).toBe(nomina.id);
    expect(snap).not.toHaveProperty("id");
  });

  it("cae al snapshot embebido de las nóminas viejas", async () => {
    // Las creadas antes de separar las colecciones lo llevan adentro.
    const vieja = await payrollsService.create({
      name: "Legacy",
      status: "paid",
      snapshot: { name: "Legacy", items: [{ rut: "1-9" }] },
    });

    const snap = await readSnapshot(await get("payrolls", vieja.id));
    expect(snap.items).toHaveLength(1);
    expect(snap.payrollId).toBe(vieja.id);
  });

  it("prefiere la colección por sobre el campo embebido", async () => {
    await seedEscenarioNomina();
    const { nomina } = await generarNomina({ nombre: "Nueva" });

    const snap = await readSnapshot({ id: nomina.id, snapshot: { name: "viejo y mentiroso" } });
    expect(snap.name).toBe("Nueva");
  });

  it("sin snapshot de ningún tipo devuelve null", async () => {
    const p = await payrollsService.create({ name: "Pelada", status: "pending" });
    expect(await readSnapshot(await get("payrolls", p.id))).toBe(null);
    expect(await readSnapshot(null)).toBe(null);
    expect(await readSnapshot({})).toBe(null);
  });
});

describe("dos nóminas contra el mismo anticipo", () => {
  // El preview de la segunda nómina puede haberse armado antes de que la
  // primera descontara, así que pide más saldo del que quedaba. `amountPaid`
  // se capa, y lo que se guarda en `payments[]` tiene que ser lo que se
  // descontó de verdad: `restoreAdvances` recalcula el saldo desde ahí, y con
  // el monto pedido el anticipo volvía con menos deuda de la real.
  const aplicar = (monto, payrollId) =>
    applyAdvancesToPayroll([{ advanceId: "adv", amount: monto }], payrollId);

  it("payments[] guarda lo descontado, no lo pedido", async () => {
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    await aplicar(80000, "nomina-A");
    await aplicar(50000, "nomina-B"); // solo quedaban 20.000

    const adv = await get("advances", "adv");
    expect(adv.amountPaid).toBe(100000);
    expect(adv.payments.map((x) => x.amount)).toEqual([80000, 20000]);
    // La invariante que antes se rompía.
    expect(adv.payments.reduce((s, x) => s + x.amount, 0)).toBe(adv.amountPaid);
  });

  it("borrar la primera deja la deuda correcta", async () => {
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    await aplicar(80000, "nomina-A");
    await aplicar(50000, "nomina-B");

    await restoreAdvancesFromPayroll(["adv"], "nomina-A");

    const adv = await get("advances", "adv");
    // B descontó 20.000 de verdad, así que quedan debiendo 80.000.
    expect(adv.amountPaid).toBe(20000);
    expect(adv.status).toBe("partial");
  });

  it("borrar las dos devuelve el anticipo entero", async () => {
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    await aplicar(80000, "nomina-A");
    await aplicar(50000, "nomina-B");

    await restoreAdvancesFromPayroll(["adv"], "nomina-A");
    await restoreAdvancesFromPayroll(["adv"], "nomina-B");

    const adv = await get("advances", "adv");
    expect(adv.amountPaid).toBe(0);
    expect(adv.payments).toEqual([]);
    expect(adv.status).toBe("pending");
  });

  it("el recorte queda registrado para poder devolverle la diferencia", async () => {
    // Al trabajador se le retuvieron 50.000 pero la deuda solo bajó 20.000:
    // esos 30.000 hay que devolvérselos y nadie se entera si esto no avisa.
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    await aplicar(80000, "nomina-A");
    const { sobrantes } = await aplicar(50000, "nomina-B");

    expect(sobrantes).toEqual([{ advanceId: "adv", pedido: 50000, aplicado: 20000 }]);
  });

  it("sin recorte no reporta nada", async () => {
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    const { sobrantes } = await aplicar(30000, "nomina-A");
    expect(sobrantes).toEqual([]);
  });

  it("aplicar contra un anticipo ya saldado no lo mueve", async () => {
    await seedAdvance("adv", { rut: ANA.id, amount: 100000 });
    await aplicar(100000, "nomina-A");
    const { sobrantes } = await aplicar(40000, "nomina-B");

    const adv = await get("advances", "adv");
    expect(adv.amountPaid).toBe(100000);
    expect(adv.status).toBe("applied");
    expect(sobrantes).toEqual([{ advanceId: "adv", pedido: 40000, aplicado: 0 }]);
  });
});
