// Parser de archivos CSV exportados del Registro de Compras y Ventas (RCV)
// del portal del SII. Estos archivos vienen con:
// - Separador: `;`
// - Encoding: UTF-8 con BOM o ISO-8859-1.
// - Primera fila: encabezados en español.
// - Una fila por documento.
//
// Detecta si es de ventas o de compras por los encabezados ("Rut cliente" vs
// "Rut Proveedor") y devuelve registros con la forma de `dteDocuments`, sin id:
// el id lo arma `buildDteDocId` y es determinístico, así que importar dos veces
// el mismo período es idempotente.

// Tipos de DTE del SII: los más comunes para una operación agrícola y de
// servicios, no todos.
export const DTE_TYPES = {
  29: "Factura de Inicio Electrónica",
  30: "Factura",
  32: "Factura No Afecta",
  33: "Factura Electrónica",
  34: "Factura Exenta Electrónica",
  35: "Boleta",
  38: "Boleta Exenta",
  39: "Boleta Electrónica",
  41: "Boleta Exenta Electrónica",
  43: "Liquidación Factura Electrónica",
  45: "Factura de Compra",
  46: "Factura de Compra Electrónica",
  48: "Pago Electrónico",
  50: "Guía de Despacho",
  52: "Guía de Despacho Electrónica",
  55: "Nota de Débito",
  56: "Nota de Débito Electrónica",
  60: "Nota de Crédito",
  61: "Nota de Crédito Electrónica",
  103: "Liquidación",
  110: "Factura de Exportación Electrónica",
  111: "Nota de Débito de Exportación Electrónica",
  112: "Nota de Crédito de Exportación Electrónica",
};

export function dteTypeLabel(tipo) {
  const t = Number(tipo);
  return DTE_TYPES[t] || `Tipo ${tipo}`;
}

// Tabla "Códigos Otros Impuestos y Retenciones" del SII, transcrita del PDF
// oficial de las DDJJ 3327/3328:
// https://www.sii.cl/declaraciones_juradas/ddjj_3327_3328/cod_otros_imp_retenc.pdf
// Cualquier cambio se contrasta contra el PDF.
//
// **Esta columna NO es solo de impuestos adicionales.** El SII usa la misma
// `Codigo Otro Impuesto` del RCV para las RETENCIONES de cambio de sujeto: si
// la retención viene de una factura de compra (DTE 45/46), se registra ahí
// mismo. Por eso la tabla mezcla los dos tipos de código.
//
// Un código que no está en la tabla sale como "Código N" y sin categoría.
export const OTRO_IMP_CODES = {
  // Márgenes de comercialización (facturas de venta).
  14: { label: "IVA margen de comercialización", category: "otros" },
  50: { label: "IVA margen prepago", category: "otros" },

  // IVA anticipado — lo cobra el vendedor al cliente.
  17: { label: "IVA anticipado faenamiento carne (5%)", category: "anticipo" },
  18: { label: "IVA anticipado carne (5%)", category: "anticipo" },
  19: { label: "IVA anticipado harina (12%)", category: "anticipo" },

  // Retenciones de cambio de sujeto — factura de compra (DTE 45/46). Los
  // códigos de la segunda columna del PDF (301, 321, …) son la variante
  // "retención total" del mismo producto.
  15: { label: "IVA retenido total", category: "retencion" },
  30: { label: "IVA retenido legumbres (10%)", category: "retencion" },
  301: { label: "IVA retenido legumbres (total)", category: "retencion" },
  31: { label: "IVA retenido silvestres (total)", category: "retencion" },
  32: { label: "IVA retenido ganado (8%)", category: "retencion" },
  321: { label: "IVA retenido ganado (total)", category: "retencion" },
  33: { label: "IVA retenido madera (8%)", category: "retencion" },
  331: { label: "IVA retenido madera (total)", category: "retencion" },
  34: { label: "IVA retenido trigo (4%)", category: "retencion" },
  341: { label: "IVA retenido trigo (total)", category: "retencion" },
  36: { label: "IVA retenido arroz (10%)", category: "retencion" },
  361: { label: "IVA retenido arroz (total)", category: "retencion" },
  37: { label: "IVA retenido hidrobiológicas (10%)", category: "retencion" },
  371: { label: "IVA retenido hidrobiológicas (total)", category: "retencion" },
  38: { label: "IVA retenido chatarra (total)", category: "retencion" },
  39: { label: "IVA retenido PPA (total)", category: "retencion" },
  41: { label: "IVA retenido construcción (total)", category: "retencion" },
  47: { label: "IVA retenido cartones (total)", category: "retencion" },
  48: { label: "IVA retenido frambuesas y pasas (14%)", category: "retencion" },
  481: { label: "IVA retenido frambuesas y pasas (total)", category: "retencion" },
  49: { label: "Factura de compra sin retención (0%)", category: "retencion" },
  53: { label: "Impuesto retenido suplementeros (0,5%)", category: "retencion" },
  60: { label: "Impuesto retenido factura de inicio", category: "retencion" },

  // Impuesto adicional art. 37.
  23: { label: "Adicional art. 37 a/b/c — oro, joyas, pieles (15%)", category: "otros" },
  44: { label: "Adicional art. 37 e/h/i/l — alfombras, caviar (15%)", category: "otros" },
  45: { label: "Adicional art. 37 j — pirotecnia (50%)", category: "otros" },

  // Impuesto art. 42 — alcoholes y bebidas.
  24: { label: "Licores, piscos, destilados (27%)", category: "alcohol" },
  25: { label: "Vinos (15%)", category: "alcohol" },
  26: { label: "Cervezas y bebidas alcohólicas (15%)", category: "alcohol" },
  27: { label: "Bebidas analcohólicas y minerales (13%)", category: "bebidas" },

  // Combustibles. Ojo: 28 es DIÉSEL y 35 es GASOLINA, no al revés.
  28: { label: "Impuesto específico diésel", category: "combustible" },
  29: { label: "Recuperación diésel transportistas", category: "combustible" },
  35: { label: "Impuesto específico gasolina", category: "combustible" },
  51: { label: "Impuesto gas natural comprimido", category: "combustible" },
  52: { label: "Impuesto gas licuado", category: "combustible" },
  // 271 y 272 no están en el PDF oficial; cuentan como combustible (lo fijan
  // los tests) para que esos documentos entren al agrupado ⛽ por centro de costo.
  271: { label: "Petróleo diésel industrial", category: "combustible" },
  272: { label: "Otros petróleos", category: "combustible" },
};

// Categoría → cómo se muestra en los chips de la UI (emoji, label, color). El
// chip muestra ESTE label, no el del código; el nombre exacto va en el tooltip.
export const OTRO_IMP_CATEGORIES = {
  combustible: { emoji: "⛽", label: "Combustible", color: "danger" },
  retencion:   { emoji: "📑", label: "IVA retenido", color: "accent" },
  anticipo:    { emoji: "⏩", label: "IVA anticipado", color: "muted" },
  alcohol:     { emoji: "🍷", label: "Alcohol",      color: "warning" },
  tabaco:      { emoji: "🚬", label: "Tabaco",       color: "warning" },
  bebidas:     { emoji: "🥤", label: "Bebidas",      color: "accent" },
  otros:       { emoji: "•",  label: "Otro impuesto", color: "muted" },
};

// Si el código es una retención de cambio de sujeto: distingue "me retuvieron
// el IVA" de "me cobraron un impuesto adicional", que en el F29 van por separado.
export function esRetencion(code) {
  return otroImpuestoCategory(code) === "retencion";
}

export function otroImpuestoLabel(code) {
  if (code == null || code === "") return null;
  const n = Number(code);
  if (!Number.isFinite(n) || n <= 0) return null;
  return OTRO_IMP_CODES[n]?.label || `Código ${n}`;
}

export function otroImpuestoCategory(code) {
  if (code == null || code === "") return null;
  const n = Number(code);
  if (!Number.isFinite(n) || n <= 0) return null;
  return OTRO_IMP_CODES[n]?.category || null;
}

// Decodifica el ArrayBuffer del archivo intentando UTF-8 primero. Si el
// resultado tiene caracteres de reemplazo (U+FFFD) que sugieren mojibake,
// reintenta con ISO-8859-1 (latin-1). Cubre los dos formatos comunes del SII.
function decodeFileBytes(buffer) {
  // Quitar BOM UTF-8 si está presente.
  const u8 = new Uint8Array(buffer);
  const hasBom = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf;
  const body = hasBom ? u8.subarray(3) : u8;
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(body);
    // Con el carácter de reemplazo, el archivo no era UTF-8: se lee como latin-1.
    if (utf8.includes("�")) {
      return new TextDecoder("iso-8859-1").decode(body);
    }
    return utf8;
  } catch {
    return new TextDecoder("iso-8859-1").decode(body);
  }
}

// Separa una línea CSV por `;`. Respeta los campos entre comillas (`""` es una
// comilla literal) por si alguna razón social las trae; el RCV no suele usarlas.
function splitCsvLine(line, sep = ";") {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// El SII exporta montos como enteros sin separador de miles (ej. "119000")
// o con separador de miles "." y decimales con "," (ej. "1.234.567" o
// "1.234,50"). Devuelve un Number, o 0 si no se puede leer.
function parseAmount(raw) {
  if (raw == null || raw === "") return 0;
  let s = String(raw).trim();
  if (s === "" || s === "-") return 0;
  // Si tiene coma decimal: tratar puntos como miles y coma como decimal.
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Solo puntos: un único punto seguido de 1-2 dígitos es decimal; si no,
    // son separadores de miles y se quitan.
    const m = s.match(/^-?\d+\.(\d{1,2})$/);
    if (!m) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Intenta extraer un RUT del nombre del archivo. El SII suele incluir el RUT
// del contribuyente en el filename de los exports del RCV (ej.
// `Detalle_VENTA_76123456-7_202405.csv`). Devuelve "" si no encuentra nada.
// Es heurística: un archivo renombrado puede no traerlo.
export function extractRutFromFilename(name) {
  if (!name) return "";
  // Captura `12345678-9` o `1234567-K` con o sin puntos.
  const m = String(name).match(/\b(\d{1,3}(?:\.\d{3}){0,2})-([\dKk])\b/) ||
            String(name).match(/\b(\d{7,8})-([\dKk])\b/);
  if (!m) return "";
  const num = m[1].replace(/\./g, "");
  return `${num}-${m[2].toUpperCase()}`;
}

// RUT chileno al formato "12345678-9" (sin puntos, con guion), venga el DV
// separado por guion o pegado.
export function normalizeRut(rawRut) {
  if (!rawRut) return "";
  const s = String(rawRut).replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  if (s.includes("-")) {
    const [num, dv] = s.split("-");
    return `${num}-${dv}`;
  }
  if (s.length < 2) return s;
  return `${s.slice(0, -1)}-${s.slice(-1)}`;
}

// RUT sin guión ni DV — sirve como parte del doc id para que dos formatos
// del mismo RUT no creen dos docs distintos.
export function rutNumeric(rawRut) {
  const s = String(rawRut || "").replace(/\./g, "").replace(/-/g, "").toUpperCase();
  return s.length > 1 ? s.slice(0, -1) : s;
}

// Id del doc de un DTE en Firestore: companyId + kind + tipo + folio (+ el
// proveedor en compras), único dentro de la empresa. Reimportar el mismo
// período sobrescribe sin duplicar.
export function buildDteDocId({ companyId, kind, tipo, folio, rutEmisor, rutReceptor }) {
  if (!companyId) throw new Error("buildDteDocId requiere companyId");
  if (kind === "venta") {
    return `${companyId}_V_${tipo}_${folio}`;
  }
  // Compras: incluir proveedor (rutEmisor) porque dos proveedores pueden
  // tener el mismo folio en su propia secuencia.
  return `${companyId}_C_${rutNumeric(rutEmisor)}_${tipo}_${folio}`;
}

// Detecta por columnas distintivas si el encabezado es de ventas o de compras.
// Devuelve null si no lo reconoce.
function detectKind(headers) {
  const h = headers.map((x) => x.toLowerCase());
  if (h.some((x) => x.includes("rut cliente"))) return "venta";
  if (h.some((x) => x.includes("rut proveedor"))) return "compra";
  // Fallback secundario: algunos exports usan "Tipo Venta" o "Tipo Compra".
  if (h.some((x) => x.includes("tipo venta"))) return "venta";
  if (h.some((x) => x.includes("tipo compra"))) return "compra";
  return null;
}

// Busca el índice de una columna por nombre (case-insensitive, contiene).
// Devuelve -1 si no la encuentra.
function colIdx(headers, ...needles) {
  const h = headers.map((x) => x.toLowerCase().trim());
  for (const n of needles) {
    const idx = h.findIndex((x) => x === n.toLowerCase() || x.includes(n.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Parsea el ArrayBuffer del archivo y devuelve:
//   { kind: "venta"|"compra", headers, records: [...], errors: [...], stats: {...} }
// Lanza si el header no se reconoce. Filas mal formadas pasan a `errors`.
export function parseSiiRcvCsv(buffer, { companyRut } = {}) {
  const text = decodeFileBytes(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("El archivo está vacío.");
  }
  const headers = splitCsvLine(lines[0]);
  const kind = detectKind(headers);
  if (!kind) {
    throw new Error(
      "No se reconocen los encabezados del CSV. Esperado: archivo del RCV del SII (Registro de Compras y Ventas). " +
      `Headers encontrados: ${headers.slice(0, 5).join(", ")}...`,
    );
  }

  // Mapeo de columnas: los nombres varían entre exports del SII, así que se
  // aceptan varios.
  const iTipo = colIdx(headers, "tipo doc", "tipo dte");
  const iFolio = colIdx(headers, "folio");
  const iFecha = colIdx(headers, "fecha docto", "fecha emision");
  const iRutContraparte = kind === "venta"
    ? colIdx(headers, "rut cliente")
    : colIdx(headers, "rut proveedor");
  const iRazon = colIdx(headers, "razon social");
  const iExento = colIdx(headers, "monto exento");
  const iNeto = colIdx(headers, "monto neto");
  const iIvaNoRec = colIdx(headers, "monto iva no recuperable");
  // `monto iva` es para los exports con una sola columna de IVA. Como `colIdx`
  // matchea por "contiene", se descarta si cae en la misma columna que la No
  // Recuperable; si no, el IVA se sumaría dos veces (`ivaRec + ivaNoRec`).
  const iIvaRecRaw = colIdx(headers, "monto iva recuperable", "monto iva");
  const iIvaRec = iIvaRecRaw === iIvaNoRec ? -1 : iIvaRecRaw;
  const iOtroImp = colIdx(headers, "valor otro imp", "monto otro imp");
  // Código del "Otro Impuesto" (ej. 28 diésel, 15 IVA retenido total). Ojo que
  // esta columna carga DOS tablas del SII a la vez — ver `OTRO_IMP_CODES`.
  const iOtroImpCod = colIdx(headers, "codigo otro imp", "código otro imp", "cod otro imp");
  const iTotal = colIdx(headers, "monto total");

  // Retenciones de cambio de sujeto. El código dice de QUÉ tipo es; estas
  // columnas dicen CUÁNTO se retuvo, y así se distingue una retención parcial
  // (4% trigo, 8% madera, 14% frambuesas…) de la total del 19%: el
  // `Monto Total` del RCV ya viene con la retención descontada.
  //
  // Solo están en el RCV de ventas (el cliente emitió la factura de compra y
  // retuvo el IVA). En compras el monto retenido va en `Valor Otro Imp`, junto
  // al código.
  const iRetTotal = colIdx(headers, "iva retenido total");
  const iRetParcial = colIdx(headers, "iva retenido parcial");
  const iNoRetenido = colIdx(headers, "iva no retenido");
  const iOtroImpTasa = colIdx(headers, "tasa otro imp");

  if (iTipo < 0 || iFolio < 0 || iFecha < 0 || iRutContraparte < 0 || iTotal < 0) {
    throw new Error(
      "Faltan columnas requeridas en el CSV (Tipo Doc, Folio, Fecha Docto, RUT, Monto Total).",
    );
  }

  const records = [];
  const errors = [];
  const stats = { byTipo: {}, totalAmount: 0, count: 0 };

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    try {
      const tipo = Number(cols[iTipo]);
      const folio = Number(cols[iFolio]);
      if (!Number.isFinite(tipo) || tipo <= 0) continue; // línea vacía / footer
      if (!Number.isFinite(folio) || folio <= 0) continue;
      const fechaRaw = cols[iFecha] || "";
      const fecha = normalizeFecha(fechaRaw);
      const rutContraparte = normalizeRut(cols[iRutContraparte] || "");
      const razon = (cols[iRazon] || "").trim();
      const exento = iExento >= 0 ? parseAmount(cols[iExento]) : 0;
      const neto = iNeto >= 0 ? parseAmount(cols[iNeto]) : 0;
      const ivaRec = iIvaRec >= 0 ? parseAmount(cols[iIvaRec]) : 0;
      const ivaNoRec = iIvaNoRec >= 0 ? parseAmount(cols[iIvaNoRec]) : 0;
      const otroImp = iOtroImp >= 0 ? parseAmount(cols[iOtroImp]) : 0;
      const otroImpCodRaw = iOtroImpCod >= 0 ? cols[iOtroImpCod] : "";
      const otroImpCod = otroImpCodRaw ? Number(String(otroImpCodRaw).trim()) || null : null;
      const total = parseAmount(cols[iTotal]);

      // IVA retenido, venga de donde venga. En ventas el RCV usa columnas
      // propias; en compras el monto va en `Valor Otro Imp` y solo cuenta como
      // retención si el código lo es (ese campo también carga impuestos
      // adicionales, que NO son una retención).
      const retTotal = iRetTotal >= 0 ? parseAmount(cols[iRetTotal]) : 0;
      const retParcial = iRetParcial >= 0 ? parseAmount(cols[iRetParcial]) : 0;
      const ivaNoRetenido = iNoRetenido >= 0 ? parseAmount(cols[iNoRetenido]) : 0;
      const porColumna = retTotal + retParcial;
      const ivaRetenido = porColumna > 0
        ? porColumna
        : (esRetencion(otroImpCod) ? otroImp : 0);

      // "total" vs "parcial" sale de la columna cuando el CSV la trae. Si no
      // (caso compras), se deduce comparando contra el IVA del documento: es
      // total cuando se retuvo todo. El margen de 1 peso es por redondeo.
      const iva = ivaRec + ivaNoRec;
      const ivaRetenidoTipo = ivaRetenido <= 0
        ? null
        : retParcial > 0 ? "parcial"
        : retTotal > 0 ? "total"
        : (iva > 0 && Math.abs(ivaRetenido - iva) <= 1 ? "total" : "parcial");

      // Tasa de retención (19%, 14%…). La del CSV manda; si no viene, se deriva
      // del neto.
      const tasaCsv = iOtroImpTasa >= 0 ? parseAmount(cols[iOtroImpTasa]) : 0;
      const retencionTasa = ivaRetenido <= 0
        ? null
        : tasaCsv > 0 ? tasaCsv
        : neto > 0 ? Math.round((ivaRetenido / neto) * 1000) / 10
        : null;

      // En ventas el emisor es la empresa (companyRut, o vacío si no se pasó) y
      // el receptor la contraparte. En compras, al revés.
      const rutEmisor = kind === "venta" ? (companyRut || "") : rutContraparte;
      const razonSocialEmisor = kind === "venta" ? "" : razon;
      const rutReceptor = kind === "venta" ? rutContraparte : (companyRut || "");
      const razonSocialReceptor = kind === "venta" ? razon : "";

      const periodo = fecha ? fecha.slice(0, 7) : "";

      // Sin id: quien llama lo arma con `buildDteDocId` cuando sabe el companyId.
      const rec = {
        kind,
        tipo,
        tipoLabel: dteTypeLabel(tipo),
        folio,
        fechaEmision: fecha,
        periodo,
        rutEmisor,
        razonSocialEmisor,
        rutReceptor,
        razonSocialReceptor,
        exento,
        neto,
        iva,
        otrosImpuestos: otroImp,
        otroImpuestoCodigo: otroImpCod,
        otroImpuestoCategory: otroImpuestoCategory(otroImpCod),
        // Cambio de sujeto: IVA retenido, que el `total` del RCV ya trae
        // descontado.
        ivaRetenido,
        ivaRetenidoTipo,
        ivaNoRetenido,
        retencionTasa,
        total,
        source: "sii_import",
      };
      records.push(rec);
      stats.byTipo[tipo] = (stats.byTipo[tipo] || 0) + 1;
      stats.totalAmount += total;
      stats.count++;
    } catch (err) {
      errors.push({ line: i + 1, raw: lines[i], message: err.message || String(err) });
    }
  }

  return { kind, headers, records, errors, stats };
}

// El SII exporta fechas como YYYY-MM-DD, DD/MM/YYYY o DD-MM-YYYY. Las lleva a
// YYYY-MM-DD (string).
function normalizeFecha(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s; // formato desconocido: se devuelve tal cual
}
