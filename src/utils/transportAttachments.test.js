import { describe, it, expect } from "vitest";
import { abonoAttachmentCount, abonoFileLabel, abonoOfAttachment, carrierFiles, paymentFileLabel } from "./transportAttachments";

const abono = { id: "ab1", date: "2026-10-12", amount: 50000 };
const october = {
  id: "P1",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-15",
  abonos: [abono],
  attachments: [
    { id: "f1", name: "transferencia.jpg", abonoId: "ab1" },
    { id: "f2", name: "factura.pdf" },
  ],
};
const november = { id: "P2", periodFrom: "2026-11-01", periodTo: "2026-11-15", attachments: [{ id: "f3", name: "cartola.pdf" }] };
const empty = { id: "P3", periodFrom: "2026-12-01", periodTo: "2026-12-15" };

describe("de dónde viene un adjunto de transporte", () => {
  it("el resumen con su período, o con el día que tiene", () => {
    expect(paymentFileLabel(october)).toBe("Resumen 01-10-2026 → 15-10-2026");
    expect(paymentFileLabel({ periodFrom: "2026-10-01", periodTo: "2026-10-01" })).toBe("Resumen 01-10-2026");
    expect(paymentFileLabel({ periodTo: "2026-10-15" })).toBe("Resumen 15-10-2026");
    expect(paymentFileLabel({})).toBe("Resumen");
  });

  it("el abono con su fecha y su monto", () => {
    expect(abonoFileLabel(abono)).toBe("Abono 12-10-2026 · $50.000");
  });

  it("un adjunto respalda un abono solo si ese abono sigue en el resumen", () => {
    expect(abonoOfAttachment(october, october.attachments[0])).toBe(abono);
    expect(abonoOfAttachment(october, october.attachments[1])).toBeNull();
    expect(abonoOfAttachment({ ...october, abonos: [] }, october.attachments[0])).toBeNull();
    expect(abonoAttachmentCount(october, "ab1")).toBe(1);
    expect(abonoAttachmentCount(october, "otro")).toBe(0);
  });
});

describe("los archivos de un transportista", () => {
  it("del resumen más nuevo al más viejo, con su resumen y su abono", () => {
    const files = carrierFiles([october, empty, november]);
    expect(files.map((f) => f.id)).toEqual(["f3", "f1", "f2"]);
    expect(files[0]).toMatchObject({ paymentId: "P2", groupLabel: "Resumen 01-11-2026 → 15-11-2026", abonoLabel: "", context: "Resumen 01-11-2026 → 15-11-2026" });
    expect(files[1]).toMatchObject({ paymentId: "P1", abonoLabel: "Abono 12-10-2026 · $50.000", context: "Resumen 01-10-2026 → 15-10-2026 · Abono 12-10-2026 · $50.000" });
  });

  it("sin adjuntos, la lista queda vacía", () => {
    expect(carrierFiles([empty])).toEqual([]);
    expect(carrierFiles(undefined)).toEqual([]);
  });
});
