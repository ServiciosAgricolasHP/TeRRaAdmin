// Las formas en que el snapshot guarda un ciclo, una jornada y un anticipo.
// Las usan todos los caminos que escriben el snapshot (generar, agregar
// ciclos, recalcular): al ser contrato externo, el JSON tiene que salir igual
// por cualquiera de ellos.
//
// `laborIds` es interno de la nómina (qué labores trae Recalcular) y no viaja:
// el portal de trabajadores no lo necesita.
export function snapshotCycleOf(detail, cycle) {
  const { laborIds: _interno, ...cd } = detail || {};
  return { ...cd, ...snapshotLaborsOf(cycle) };
}

// Las labores y los precios del día de un ciclo, con la forma del snapshot.
export function snapshotLaborsOf(cycle) {
  return {
    dayPrices: cycle?.dayPrices || {},
    labors: (cycle?.labors || []).map((l) => ({
      id: l.id, name: l.name, type: l.type,
      // Catálogo: tratoType (Poda/Amarre/...) y tratoUnit (Planta/
      // Metro/...) son índices del catálogo. Para cosecha la unidad
      // se deriva de containerY del workday → cosechaUnit(catalogs).
      tratoType: l.tratoType ?? null,
      tratoUnit: l.tratoUnit ?? null,
      cosechaMode: l.cosechaMode || null,
      cosechaPrices: l.cosechaPrices || null,
      tratoMode: l.tratoMode || null,
      tratoTiers: l.tratoTiers || null,
      tratoHEDailyAmount: l.tratoHEDailyAmount ?? null,
      tratoHEOvertimeRate: l.tratoHEOvertimeRate ?? null,
      tratoHEManejoAmount: l.tratoHEManejoAmount ?? null,
      tratoHESupervisionAmount: l.tratoHESupervisionAmount ?? null,
      normalDailyAmount: l.normalDailyAmount ?? null,
      // tratoEtapas: etapas de la labor (nombre + tarifa por día + counts).
      stages: l.stages ?? null,
    })),
  };
}

export function snapshotWorkdayOf(wd) {
  return {
    id: wd.id,
    cycleId: wd.cycleId, laborId: wd.laborId,
    workerRut: wd.workerRut, date: wd.date,
    qty: wd.qty ?? null, amount: wd.amount ?? 0,
    qualityX: wd.qualityX ?? null, containerY: wd.containerY ?? null,
    tierKey: wd.tierKey ?? null, tiers: wd.tiers ?? null,
    stageId: wd.stageId ?? null,
    overtimeHours: wd.overtimeHours ?? null,
    hasManejo: !!wd.hasManejo, hasSupervision: !!wd.hasSupervision,
    extras: wd.extras ?? null, isHoliday: !!wd.isHoliday,
  };
}

export function snapshotAdvanceOf(adv) {
  return {
    id: adv.id, workerRut: adv.workerRut,
    type: adv.type, amount: Number(adv.amount) || 0,
    amountPaid: Number(adv.amountPaid) || 0,
    date: adv.date || null, note: adv.note || "",
    status: adv.status || null,
  };
}
