import { describe, it, expect } from "vitest";
import { workdaysService } from "../../src/services";
import { set, get, all } from "./helpers/seed";

// Jornada con la que se revisa el log de auditoría que deja `remove`.
const WORKDAY = { cycleId: "ciclo-1", workerRut: "11111111-1", amount: 100 };

describe("remove y su log de auditoría", () => {
  it("borra la jornada y deja un log con su trabajador y su ciclo", async () => {
    await set("workdays", "wd-remove-1", WORKDAY);

    await workdaysService.remove("wd-remove-1");

    expect(await get("workdays", "wd-remove-1")).toBeNull();
    const logs = await all("logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "delete",
      entity: "workday",
      entityId: "wd-remove-1",
      before: { amount: 100 },
      meta: { workerRut: "11111111-1", cycleId: "ciclo-1" },
    });
  });

  it("borrar dos veces la misma jornada deja un solo log", async () => {
    await set("workdays", "wd-remove-2", WORKDAY);

    await workdaysService.remove("wd-remove-2");
    await workdaysService.remove("wd-remove-2");

    const logs = await all("logs");
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toEqual({ workerRut: "11111111-1", cycleId: "ciclo-1" });
  });

  it("no escribe nada si la jornada no existe", async () => {
    await workdaysService.remove("wd-missing");

    expect(await all("logs")).toHaveLength(0);
  });
});
