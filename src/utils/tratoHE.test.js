import { describe, it, expect } from "vitest";
import {
  calcTratoHEAmount,
  isWeekendDate,
  isRedDay,
  workdayHasData,
  DEFAULT_BONUS_MANEJO,
  DEFAULT_BONUS_SUPERVISION,
  DEFAULT_OVERTIME_RATE,
} from "./tratoHE";

describe("calcTratoHEAmount", () => {
  // Fórmula de sueldo literal: base + HE×tarifa + manejo + supervisión + extras.
  it("suma los cinco componentes", () => {
    expect(
      calcTratoHEAmount({
        qty: 25000,
        overtimeHours: 2,
        hasManejo: true,
        hasSupervision: true,
        extras: 1000,
        overtimeRate: 3500,
        bonusManejo: 12000,
        bonusSupervision: 5000,
      }),
    ).toBe(25000 + 7000 + 12000 + 5000 + 1000);
  });

  it("usa los defaults cuando no se pasan tarifas", () => {
    expect(calcTratoHEAmount({ qty: 0, overtimeHours: 1 })).toBe(DEFAULT_OVERTIME_RATE);
    expect(calcTratoHEAmount({ qty: 0, hasManejo: true })).toBe(DEFAULT_BONUS_MANEJO);
    expect(calcTratoHEAmount({ qty: 0, hasSupervision: true })).toBe(DEFAULT_BONUS_SUPERVISION);
  });

  it("el modo overtimeOnly anula la base pero no los bonos", () => {
    expect(
      calcTratoHEAmount({
        qty: 25000,
        overtimeHours: 2,
        hasManejo: true,
        dayMode: "overtimeOnly",
        overtimeRate: 3500,
        bonusManejo: 12000,
      }),
    ).toBe(0 + 7000 + 12000);
  });

  it("qty es un monto en pesos, no una cantidad a multiplicar", () => {
    // El header del módulo lo dice: `qty` guarda la base del día en moneda.
    expect(calcTratoHEAmount({ qty: 30000 })).toBe(30000);
  });

  it("acepta extras negativos como descuento", () => {
    expect(calcTratoHEAmount({ qty: 25000, extras: -5000 })).toBe(20000);
  });

  it("acepta horas extras fraccionarias", () => {
    expect(calcTratoHEAmount({ qty: 0, overtimeHours: 1.5, overtimeRate: 3000 })).toBe(4500);
  });

  it("no propaga NaN con basura ni con entrada vacía", () => {
    expect(calcTratoHEAmount({ qty: "x", overtimeHours: null, extras: undefined })).toBe(0);
    expect(calcTratoHEAmount(null)).toBe(0);
    expect(calcTratoHEAmount({})).toBe(0);
  });

  it("una tarifa de HE en 0 no cobra las horas", () => {
    expect(calcTratoHEAmount({ qty: 100, overtimeHours: 8, overtimeRate: 0 })).toBe(100);
  });
});

describe("isWeekendDate", () => {
  // Parsea con "T00:00:00" o sea en hora local: dejamos fijado que la fecha no
  // se corre un día por zona horaria.
  it("reconoce sábado y domingo", () => {
    expect(isWeekendDate("2026-09-19")).toBe(true); // sábado
    expect(isWeekendDate("2026-09-20")).toBe(true); // domingo
  });

  it("los días de semana no son finde", () => {
    expect(isWeekendDate("2026-09-18")).toBe(false); // viernes
    expect(isWeekendDate("2026-09-21")).toBe(false); // lunes
  });

  it("no rompe con entradas inválidas", () => {
    for (const v of ["", null, undefined, "no-es-fecha", 20260919]) {
      expect(isWeekendDate(v)).toBe(false);
    }
  });
});

describe("isRedDay", () => {
  it("es rojo por finde o por feriado marcado a mano", () => {
    expect(isRedDay("2026-09-19", null)).toBe(true);
    expect(isRedDay("2026-09-18", { isHoliday: true })).toBe(true);
    expect(isRedDay("2026-09-18", { isHoliday: false })).toBe(false);
    expect(isRedDay("2026-09-18", null)).toBe(false);
  });
});

describe("workdayHasData", () => {
  it("decide si la fila vale la pena guardar", () => {
    expect(workdayHasData(null)).toBe(false);
    expect(workdayHasData({})).toBe(false);
    expect(workdayHasData({ qty: 0, overtimeHours: 0, extras: 0 })).toBe(false);
    expect(workdayHasData({ qty: 1 })).toBe(true);
    expect(workdayHasData({ overtimeHours: 0.5 })).toBe(true);
    expect(workdayHasData({ hasManejo: true })).toBe(true);
    expect(workdayHasData({ hasSupervision: true })).toBe(true);
  });

  it("un extra negativo cuenta como dato", () => {
    // Es un descuento, y perderlo cambiaría la plata.
    expect(workdayHasData({ extras: -1000 })).toBe(true);
  });
});
