import { describe, it, expect, vi } from "vitest";

vi.mock("html-to-image", () => ({ toBlob: vi.fn(), toPng: vi.fn() }));
const { printDocument, PRINT_GRID_CSS } = await import("./printWindow");

describe("printDocument", () => {
  it("lleva el título, el cuerpo y la orientación de la hoja", () => {
    const html = printDocument({ title: "Resumen", body: "<table></table>", page: "portrait", margin: "10mm" });
    expect(html).toContain("<title>Resumen</title>");
    expect(html).toContain("<body><table></table>");
    expect(html).toContain("@page { size: portrait; margin: 10mm; }");
  });

  it("por defecto va apaisado con margen de 12 mm", () => {
    expect(printDocument({ body: "" })).toContain("@page { size: landscape; margin: 12mm; }");
  });

  it("escapa el título, que puede traer nombres escritos a mano", () => {
    const html = printDocument({ title: 'Faena <Norte> & "Sur"', body: "" });
    expect(html).toContain("<title>Faena &lt;Norte&gt; &amp; &quot;Sur&quot;</title>");
  });

  it("suma el CSS propio después del común, así lo puede pisar", () => {
    const html = printDocument({ body: "", css: PRINT_GRID_CSS });
    expect(html.indexOf(PRINT_GRID_CSS)).toBeGreaterThan(html.indexOf("table { border-collapse"));
  });

  it("imprime al cargar salvo que se pida lo contrario", () => {
    expect(printDocument({ body: "" })).toContain("window.print()");
    expect(printDocument({ body: "", autoPrint: false })).not.toContain("window.print()");
  });
});
