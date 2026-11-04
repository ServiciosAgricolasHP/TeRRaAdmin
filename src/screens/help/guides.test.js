import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_GUIDE_BY_PATH } from "../../components/layout/helpLinks";
import { parseGuide } from "../../utils/helpGuides";
import { buildHelpIndex, searchHelp } from "../../utils/helpSearch";
import { GUIDES } from "./guides";
import imageSizes from "./imageSizes.json";

const parsed = GUIDES.map((g) => parseGuide(g.id, g.source));
const index = buildHelpIndex(parsed);
const top = (q) => searchHelp(index, q, { isAdmin: true })[0]?.id;

describe("las guías de la ayuda", () => {
  it("cada guía tiene título y secciones, y cada sección sus preguntas de ejemplo", () => {
    for (const g of parsed) {
      expect(g.title, g.id).not.toBe(g.id);
      expect(g.sections.length, g.id).toBeGreaterThan(0);
      for (const s of g.sections) expect(s.questions.length, `${g.id}#${s.id}`).toBeGreaterThan(0);
    }
  });

  it("cada imagen existe en public/help y tiene su ancho y alto anotados", () => {
    for (const g of parsed) {
      for (const s of g.sections) {
        for (const [, src] of s.body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
          expect(fs.existsSync(new URL(`../../../public/${src}`, import.meta.url)), src).toBe(true);
          expect(imageSizes[src], src).toHaveLength(2);
        }
      }
    }
  });

  it("el botón ? de cada pantalla apunta a una guía que existe", () => {
    const ids = new Set(GUIDES.map((g) => g.id));
    for (const [, guideId] of HELP_GUIDE_BY_PATH) expect(ids.has(guideId), guideId).toBe(true);
  });
});

describe("preguntas típicas", () => {
  it.each([
    ["cómo anoto el monto de un día", "grilla-del-ciclo#anotar-el-monto-de-un-dia"],
    ["cómo agrego un trabajador al ciclo", "grilla-del-ciclo#agregar-a-una-persona-a-la-labor"],
    ["pegar una columna desde excel", "grilla-del-ciclo#anotar-o-borrar-varias-celdas-de-una-vez"],
    ["me equivoqué y quiero volver atrás", "grilla-del-ciclo#deshacer-un-cambio"],
    ["trabajador con sueldo mensual", "grilla-del-ciclo#sueldo-mensual-solo-asistencia"],
    ["no me deja escribir en la celda", "grilla-del-ciclo#si-algo-no-se-deja-editar"],
    ["cómo creo un fundo nuevo", "faenas-y-ciclos#crear-una-faena"],
    ["cómo agrego un cuartel a la faena", "faenas-y-ciclos#crear-una-subfaena"],
    ["cómo cierro un ciclo", "faenas-y-ciclos#cerrar-un-ciclo"],
    ["corregir un ciclo cerrado", "faenas-y-ciclos#reabrir-un-ciclo"],
    ["mover jornadas a otro ciclo", "faenas-y-ciclos#agregar-otro-ciclo-a-una-subfaena"],
    ["no me deja eliminar una faena", "faenas-y-ciclos#eliminar-un-ciclo-una-subfaena-o-una-faena"],
    ["cómo pago las horas extras", "precios-del-dia#jornadas-con-horas-extras"],
    ["qué es el piso", "precios-del-dia#piso-un-bono-del-dia"],
    ["precio por kilo de la cosecha", "precios-del-dia#cosecha-un-precio-por-calidad-y-envase"],
    ["varios precios en un día de trato", "precios-del-dia#a-trato-uno-o-varios-precios-por-dia"],
    ["cambié el precio y qué pasa con los montos", "precios-del-dia#cambiar-un-precio-que-ya-se-uso"],
    ["cómo agrego una labor", "precios-del-dia#agregar-una-labor-al-ciclo"],
    ["cómo armo la nómina de la semana", "nomina#elegir-los-ciclos"],
    ["descargar el archivo para el banco", "nomina#descargar-el-archivo-del-banco"],
    ["imprimir comprobantes para firmar", "nomina#imprimir-los-comprobantes"],
    ["ya pagué la nómina", "nomina#marcar-la-nomina-pagada"],
    ["pagar el efectivo después", "nomina#pagar-en-dos-tiempos-primero-las-transferencias"],
    ["cambiar a efectivo solo en esta nómina", "nomina#revisar-la-vista-previa"],
    ["cambiar a alguien a efectivo", "trabajadores#como-cobra-banco-o-efectivo"],
    ["falta alguien en la nómina", "nomina#si-algo-no-funciona"],
    ["se me olvidó una persona en la nómina", "corregir-nomina#agregar-los-dias-de-una-persona"],
    ["cómo agrego a una persona a nómina", "corregir-nomina#agregar-los-dias-de-una-persona"],
    ["cambié un monto en la grilla después de hacer la nómina", "corregir-nomina#traer-los-cambios-de-la-grilla-recalcular"],
    ["sacar un ciclo de la nómina", "corregir-nomina#agregar-o-sacar-ciclos-y-labores"],
    ["quitar a un trabajador de la nómina", "corregir-nomina#sacar-a-una-persona"],
    ["agregar otro ciclo a la nómina", "corregir-nomina#agregar-o-sacar-ciclos-y-labores"],
    ["cambiar los ciclos de la nómina", "corregir-nomina#agregar-o-sacar-ciclos-y-labores"],
    ["cómo anoto un anticipo", "anticipos-y-bonos#anotar-un-anticipo"],
    ["descontar el anticipo en cuotas", "anticipos-y-bonos#descontar-un-anticipo-en-cuotas"],
    ["qué significa parcial", "anticipos-y-bonos#despues-de-la-nomina"],
    ["el anticipo es más grande que lo que gana", "anticipos-y-bonos#como-los-aplica-la-nomina"],
    ["pagar un bono a un trabajador", "anticipos-y-bonos#anotar-un-bono"],
    ["cuánto le cobro al cliente", "resumen-del-ciclo#para-cobrar-las-tarifas"],
    ["agregar un día al cobro", "resumen-del-ciclo#ajustar-un-dia-o-agregar-uno"],
    ["cobrar con iva", "resumen-del-ciclo#iva-descuento-y-columnas"],
    ["no puedo copiar el resumen", "resumen-del-ciclo#copiar-descargar-imprimir-y-excel"],
    ["importar ciclos anteriores", "resumen-del-ciclo#juntar-labores-o-traer-las-de-otro-ciclo"],
    ["cómo agrego un transportista", "transportes#agregar-un-transportista"],
    ["cómo anoto una vuelta", "transportes#anotar-las-vueltas-del-ciclo"],
    ["vueltas sin precio", "transportes#poner-el-precio-a-las-vueltas-que-no-lo-tienen"],
    ["mandarle el detalle al transportista", "transportes#el-resumen-de-un-transportista"],
    ["balance de quincenas", "pagar-transportes#ver-cuanto-se-debe"],
    ["generar los resúmenes de transporte", "pagar-transportes#armar-los-resumenes-de-una-faena"],
    ["abono al transportista", "pagar-transportes#anotar-un-abono"],
    ["crear una quincena", "pagar-transportes#armar-la-quincena"],
    ["marcar la quincena pagada", "pagar-transportes#pagar-la-quincena"],
    ["liquidar un resumen con abonos", "pagar-transportes#liquidar-un-resumen"],
    ["pagar el saldo del resumen", "pagar-transportes#liquidar-un-resumen"],
    ["cómo importo las facturas del SII", "facturacion#importar-el-registro-del-sii"],
    ["marcar una factura pagada", "facturacion#marcar-si-una-factura-esta-pagada"],
    ["abono a una factura", "facturacion#anotar-un-pago-o-un-abono"],
    ["cuánto nos deben los clientes", "facturacion#ver-lo-que-falta-por-cobrar"],
    ["iva a pagar del año", "facturacion#el-resumen-del-ano-y-el-iva"],
    ["gasto sin factura", "facturacion#centros-de-costo-y-gastos-informales"],
    ["anotar un cheque", "cheques-y-pagos#anotar-un-cheque-o-un-pago"],
    ["crédito en cuotas", "cheques-y-pagos#un-credito-en-cuotas-o-un-pago-recurrente"],
    ["cheque protestado", "cheques-y-pagos#aplazar-protestar-reprogramar-o-anular"],
    ["pagué con intereses", "cheques-y-pagos#marcar-un-pago-o-un-cheque-cobrado"],
    ["cuándo terminamos de pagar el crédito", "cheques-y-pagos#el-informe-de-deudas"],
    ["portal de trabajadores", "nomina#la-nomina-en-el-portal-de-trabajadores"],
    ["cómo agrego un trabajador nuevo", "trabajadores#agregar-un-trabajador"],
    ["cambiar la cuenta de un trabajador", "trabajadores#como-cobra-banco-o-efectivo"],
    ["el trabajador cobra en la cuenta de otro", "trabajadores#cobrar-en-la-cuenta-de-otra-persona"],
    ["dirección del trabajador", "trabajadores#datos-personales"],
    ["contratar a todos los del ciclo", "contratos#contratar-a-varias-personas-de-una-vez"],
    ["empresa mandante", "contratos#los-mandantes"],
    ["ponerle el mandante a los contratos", "contratos#los-mandantes"],
    ["terminar un contrato", "contratos#terminar-contratos"],
    ["finiquitos pendientes", "contratos#seguir-los-finiquitos"],
    ["cómo hago las boletas de honorarios", "contratos#generar-la-lista-de-honorarios"],
    ["anotar el folio de la boleta", "contratos#anotar-las-boletas-emitidas"],
    ["cómo hago las imposiciones", "contratos#generar-la-lista-de-imposiciones-del-mes"],
    ["honorarios de una sola faena", "contratos#generar-la-lista-de-honorarios"],
    ["agregar la dirección para la boleta", "contratos#generar-la-lista-de-honorarios"],
    ["imposiciones de una sola faena", "contratos#generar-la-lista-de-imposiciones-del-mes"],
    ["cómo se calcula el bono de las imposiciones", "contratos#generar-la-lista-de-imposiciones-del-mes"],
    ["mandar las imposiciones al contador", "contratos#enviar-las-imposiciones-al-contador"],
    ["olvidé mi contraseña", "primeros-pasos#entrar-a-terra"],
    ["cómo pongo el modo oscuro", "primeros-pasos#cambiar-los-colores"],
    ["instalar la app en el celular", "primeros-pasos#usar-terra-en-el-telefono"],
  ])("«%s» encuentra su sección primero", (question, expected) => {
    expect(top(question)).toBe(expected);
  });
});
