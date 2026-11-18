import { describe, expect, it } from "vitest";
import { checkGroupText, checksText } from "./checksText";

const sameDay = { id: "sameDayLabors", title: "Más de una labor el mismo día" };
const noGroup = { id: "missingGroup", title: "Sin grupo" };
const qr = { id: "staleQrSync", title: "Pesajes QR sin sincronizar" };

const ana = {
  key: "sameDayLabors|1-9",
  name: "ANA PÉREZ",
  rut: "12.345.678-5",
  severity: "orange",
  lines: ["12-nov: Poda · Ciclo Uno $25.000 (en esta nómina) y Cosecha · Ciclo Dos $20.000 (pendiente)"],
  review: null,
};
const luis = {
  key: "sameDayLabors|2-7",
  name: "LUIS SOTO",
  rut: "11111111-1",
  severity: "red",
  lines: ["10-nov: Poda $20.000 y Raleo $18.000", "11-nov: Poda $20.000 y Raleo $18.000"],
  review: null,
};
const eva = { key: "sameDayLabors|3-5", name: "EVA ROJAS", rut: "3-5", severity: "orange", lines: ["10-nov: …"], review: { byName: "Ana" } };

describe("checkGroupText", () => {
  it("copia el título, cuántas faltan y cada persona con su RUT sin puntos, sin las revisadas", () => {
    expect(checkGroupText(sameDay, [ana, luis, eva])).toBe(
      [
        "🔴 Más de una labor el mismo día (2)",
        "• ANA PÉREZ (12345678-5): 12-nov: Poda · Ciclo Uno $25.000 (en esta nómina) y Cosecha · Ciclo Dos $20.000 (pendiente)",
        "• LUIS SOTO (11111111-1):",
        "   - 10-nov: Poda $20.000 y Raleo $18.000",
        "   - 11-nov: Poda $20.000 y Raleo $18.000",
      ].join("\n"),
    );
  });

  it("una revisión con todas revisadas no copia nada", () => {
    expect(checkGroupText(sameDay, [eva])).toBe("");
  });

  it("una alerta que no es de una persona va con su nombre, sin RUT", () => {
    const prefix = { key: "staleQrSync|HP", general: true, name: "Prefijo QR HP", rut: "", severity: "orange", lines: ["Sin sincronizar desde el 10-nov"], review: null };
    expect(checkGroupText(qr, [prefix])).toBe("🟠 Pesajes QR sin sincronizar (1)\n• Prefijo QR HP: Sin sincronizar desde el 10-nov");
  });
});

describe("las cuentas compartidas", () => {
  const shared = { id: "sharedAccount", title: "Cuenta compartida" };
  const anaAccount = { key: "012|11111111", holder: "ANA PÉREZ", holderName: "ANA PÉREZ", holderRut: "11111111-1" };
  const rutAccount = { key: "012|55555555", holder: "RUT 55.555.555-5", holderName: "", holderRut: "55555555-5" };
  const person = (key, name, rut, account, review = null) => ({ key, name, rut, account, severity: "orange", lines: [`Cobra en la cuenta de ${account.holder}`], review });

  it("copia una línea por cuenta, con quienes cobran en ella y sin las revisadas", () => {
    const alerts = [
      person("sharedAccount|2", "JUAN SOTO", "22.222.222-2", anaAccount),
      person("sharedAccount|3", "MARÍA ROJAS", "33.333.333-3", anaAccount),
      person("sharedAccount|4", "LUIS DÍAZ", "44.444.444-4", anaAccount, { byName: "Eva" }),
      person("sharedAccount|6", "EVA ROJAS", "66.666.666-6", rutAccount),
      person("sharedAccount|7", "DANA RÍOS", "77.777.777-7", rutAccount),
    ];
    expect(checkGroupText(shared, alerts)).toBe(
      [
        "🟠 Cuenta compartida (4)",
        "• Cuenta de ANA PÉREZ (11111111-1): JUAN SOTO (22222222-2) y MARÍA ROJAS (33333333-3)",
        "• Cuenta de RUT 55555555-5: EVA ROJAS (66666666-6) y DANA RÍOS (77777777-7)",
      ].join("\n"),
    );
  });
});

describe("checksText", () => {
  it("junta las revisiones con lo que falta, con el nombre de la nómina arriba", () => {
    const groups = [
      { check: sameDay, alerts: [ana, eva] },
      { check: noGroup, alerts: [{ ...eva, key: "missingGroup|3-5" }] },
    ];
    expect(checksText("Semana 46", groups)).toBe(
      ["Revisión de la nómina Semana 46", "🟠 Más de una labor el mismo día (1)\n• ANA PÉREZ (12345678-5): " + ana.lines[0]].join("\n\n"),
    );
  });

  it("sin nada por revisar no copia nada", () => {
    expect(checksText("Semana 46", [{ check: sameDay, alerts: [eva] }])).toBe("");
    expect(checksText("", [])).toBe("");
  });
});
