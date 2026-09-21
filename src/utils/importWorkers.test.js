import { describe, it, expect } from "vitest";
import {
  bankCodeFromCsv,
  accountTypeFromCsv,
  normalizeName,
  normalizeEmail,
  parseCsv,
  buildWorkerPatch,
  DEFAULT_EMAIL,
} from "./importWorkers";

describe("bankCodeFromCsv", () => {
  it("resuelve los nombres del CSV a códigos", () => {
    expect(bankCodeFromCsv("BANCO DEL ESTADO DE CHILE")).toBe("012");
    expect(bankCodeFromCsv("BANCO DE CHILE")).toBe("001");
    expect(bankCodeFromCsv("BANCO SANTANDER")).toBe("037");
    expect(bankCodeFromCsv("BANCO BICE")).toBe("028");
  });

  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(bankCodeFromCsv("banco de crédito e inversiones / tbanc")).toBe("016");
    expect(bankCodeFromCsv("  BANCO DE CREDITO E INVERSIONES / TBANC  ")).toBe("016");
  });

  // ⚠️ Vale la pena tenerlo fijado: un banco que el CSV escriba distinto se
  // manda a Banco Estado sin que nada avise, y la transferencia rebota o —peor—
  // le llega a otra persona con esa misma cuenta en otro banco.
  it("cae a Banco Estado en silencio con un nombre desconocido", () => {
    expect(bankCodeFromCsv("BANCO QUE NO EXISTE")).toBe("012");
    expect(bankCodeFromCsv("")).toBe("012");
    expect(bankCodeFromCsv(null)).toBe("012");
  });
});

describe("accountTypeFromCsv", () => {
  it("resuelve las etiquetas conocidas", () => {
    expect(accountTypeFromCsv("CUENTA RUT")).toBe(3);
    expect(accountTypeFromCsv("CTA CORRIENTE")).toBe(0);
    expect(accountTypeFromCsv("CTA VISTA")).toBe(1);
    expect(accountTypeFromCsv("CHEQUERA ELECTRÓNICA")).toBe(1);
    expect(accountTypeFromCsv("chequera electronica")).toBe(1);
  });

  it("cae a Cuenta RUT en silencio con una etiqueta desconocida", () => {
    expect(accountTypeFromCsv("CUENTA MÁGICA")).toBe(3);
    expect(accountTypeFromCsv("")).toBe(3);
  });
});

describe("normalizeName", () => {
  it("arma nombre propio sin acentos", () => {
    expect(normalizeName("josé", "soto", "pérez")).toBe("Jose Soto Perez");
  });

  it("descarta partes vacías y colapsa espacios", () => {
    expect(normalizeName("ana", "", "  soto  ")).toBe("Ana Soto");
    expect(normalizeName(null, undefined, "")).toBe("");
  });

  it("saca dígitos y símbolos", () => {
    expect(normalizeName("ana3", "soto-lopez")).toBe("Ana Soto Lopez");
  });

  // ⚠️ COMPORTAMIENTO ACTUAL, PARECE UN BUG (importWorkers.js:50-51)
  //
  //   const noAccents = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  //   const cleaned = noAccents.replace(/[^A-Za-z\sñÑ]/g, " ")...
  //
  // La `ñÑ` de la clase de caracteres dice que la intención era conservarla,
  // pero es código muerto: `normalize("NFD")` ya partió la ñ en "n" + tilde
  // combinante, y el replace anterior se llevó la tilde. Cuando se evalúa la
  // clase, no queda ninguna ñ que preservar.
  //
  // Consecuencia: un "Muñoz" importado por CSV queda guardado como "Munoz"
  // para siempre, y ese `name` es el que se muestra en toda la app. Solo
  // afecta al import de CSV: el alta normal usa `toProperName` de nameUtils.
  it("[bug conocido] la ñ se pierde, aunque la clase de caracteres la permita", () => {
    expect(normalizeName("ñuble")).toBe("Nuble");
    expect(normalizeName("muñoz")).toBe("Munoz");
  });
});

describe("normalizeEmail", () => {
  it("usa el correo del banco cuando no hay uno", () => {
    // El banco rechaza filas sin email.
    expect(normalizeEmail("")).toBe(DEFAULT_EMAIL);
    expect(normalizeEmail(null)).toBe(DEFAULT_EMAIL);
    expect(normalizeEmail("   ")).toBe(DEFAULT_EMAIL);
  });

  it("respeta el que viene", () => {
    expect(normalizeEmail("  a@b.cl ")).toBe("a@b.cl");
  });
});

describe("parseCsv", () => {
  it("parsea el formato separado por punto y coma", () => {
    const texto =
      "RUT;Nombre;APELLIDO;APELLIDO2;CORREO;BANCO;TIPOCUENTA;N_CUENTA\r\n" +
      "12345678-5;Ana;Soto;Perez;a@b.cl;BANCO DE CHILE;CTA CORRIENTE;123456\n";
    const { header, rows } = parseCsv(texto);
    expect(header).toHaveLength(8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rut: "12345678-5",
      nombre: "Ana",
      banco: "BANCO DE CHILE",
      nCuenta: "123456",
    });
  });

  it("descarta líneas en blanco", () => {
    expect(parseCsv("H\n\n\n").rows).toHaveLength(0);
    expect(parseCsv("").rows).toHaveLength(0);
  });

  it("tolera filas con menos columnas", () => {
    expect(parseCsv("H\n12345678-5;Ana").rows[0]).toMatchObject({ rut: "12345678-5", nCuenta: "" });
  });
});

describe("buildWorkerPatch", () => {
  const fila = (over = {}) => ({
    rut: "12345678-5",
    nombre: "ana",
    apellido: "soto",
    apellido2: "",
    correo: "a@b.cl",
    banco: "BANCO DE CHILE",
    tipoCuenta: "CTA CORRIENTE",
    nCuenta: "123 456 789",
    ...over,
  });

  it("rechaza un RUT inválido", () => {
    expect(buildWorkerPatch(fila({ rut: "12345678-9" }), null)).toHaveProperty("error");
    expect(buildWorkerPatch(fila({ rut: "" }), null)).toHaveProperty("error");
  });

  it("rechaza un nombre vacío", () => {
    const r = buildWorkerPatch(fila({ nombre: "", apellido: "", apellido2: "" }), null);
    expect(r.error).toMatch(/nombre vac/i);
  });

  it("al crear arma bankDetails en el orden que espera la app", () => {
    // [paymentRut, accountNumber, accountType, bankCode] — el orden importa.
    const r = buildWorkerPatch(fila(), null);
    expect(r.mode).toBe("create");
    expect(r.payload.bankDetails).toEqual(["12345678-5", "123456789", 0, "001"]);
    expect(r.payload).toMatchObject({ name: "Ana Soto", email: "a@b.cl" });
  });

  it("con Cuenta RUT usa el RUT sin dígito verificador como número de cuenta", () => {
    const r = buildWorkerPatch(fila({ tipoCuenta: "CUENTA RUT", nCuenta: "loquesea" }), null);
    expect(r.payload.bankDetails[1]).toBe("12345678");
    expect(r.payload.bankDetails[2]).toBe(3);
  });

  it("saca los espacios del número de cuenta", () => {
    expect(buildWorkerPatch(fila({ nCuenta: " 12 34 " }), null).payload.bankDetails[1]).toBe("1234");
  });

  it("al actualizar solo toca nombre y correo, nunca los datos bancarios", () => {
    // Un import no puede pisarle la cuenta a alguien que ya existe.
    const r = buildWorkerPatch(fila(), { id: "12345678-5", bankDetails: ["x", "y", 1, "037"] });
    expect(r.mode).toBe("update");
    expect(r.patch).toEqual({ name: "Ana Soto", email: "a@b.cl" });
    expect(r.patch).not.toHaveProperty("bankDetails");
  });

  it("normaliza el RUT antes de usarlo como id", () => {
    const r = buildWorkerPatch(fila({ rut: "12.345.678-5" }), null);
    expect(r.rut).toBe("12345678-5");
    expect(r.payload.rut).toBe("12345678-5");
  });
});
