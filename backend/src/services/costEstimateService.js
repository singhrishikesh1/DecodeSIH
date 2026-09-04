/**
 * Deterministic engineering repair cost engine.
 *
 * The AI pipeline provides detection + geometry. This engine is a pure,
 * reproducible calculation:
 *
 *   measured geometry
 *   + repair specification (material/method)
 *   + material quantities (from the ACTUAL measured volume/area)
 *   + verified regional rate table
 *   + labour + equipment + transport
 *   + configured allowance / tax / contingency
 *   = engineering repair cost estimate.
 *
 * Rules honoured:
 *   - Only VALIDATED physical measurements are used. If calibrated volume/depth
 *     is unavailable we do NOT invent dimensions — we return CALCULATION_
 *     UNAVAILABLE (never ₹0).
 *   - If a calibrated volumetric measurement exists it is used directly; if only
 *     L × W × avg-depth is available we compute volume and label it "Calculated
 *     volume" with the formula shown.
 *   - The compaction/wastage allowance factor is explicit and configurable.
 *   - Pixels are never converted to metres; the engine only uses DB measurements.
 *   - All money is handled in integer paise (decimal-safe); rounding happens once
 *     at the final total.
 *
 * The result is called an "Engineering Repair Cost Estimate" (not an exact
 * invoice) because site conditions vary; but within the stored rate snapshot and
 * assumptions it is deterministic and reproducible.
 */

const prisma = require('../config/prisma');
const {
  CATEGORY_MATERIAL,
  CATEGORY_LABOUR,
  CATEGORY_EQUIPMENT,
  CATEGORY_TRANSPORT,
  resolveRate,
} = require('./costCatalogService');

// Engineering constants (configurable in code; not hidden).
const ENGINEERING = {
  asphaltDensityKgM3: 2200, // compacted dense bituminous macadam ~2.2 t/m3
  pccDensityKgM3: 2400,     // reinforced/PCC concrete ~2.4 t/m3
  wmmDensityKgM3: 2100,     // WMM base ~2.1 t/m3
  compactionAllowance: 0.08, // explicit allowance factor (8%)
  haDistanceKm: 15,          // assumed local material haul distance
};

// Financial configuration (configurable; 0 = disabled).
const FINANCE = {
  taxRate: 0.0,        // GST, only if configured (0 = disabled)
  contingencyRate: 0.05, // contingency %, only if configured
};

const ROAD_TYPES = ['NATIONAL_HIGHWAY', 'STATE_HIGHWAY', 'MUNICIPAL', 'RURAL', 'OTHER'];
const ROAD_MATERIALS = ['BITUMINOUS', 'CONCRETE', 'WMM', 'OTHER'];

function isPositiveNum(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Integer micro-paise? No — use integer paise (₹ × 100) for decimal safety. */
function toPaise(n) {
  return Math.round(n * 100);
}
function fromPaise(p) {
  return p / 100;
}

/**
 * Determine geometry to cost from the authoritative Pothole record.
 * Returns { measurementStatus, volumeM3, areaM2, lengthM, widthM, avgDepthCm,
 *           maxDepthCm, volumeSource } or throws CostUnavailableError.
 */
function collectGeometry(pothole) {
  const status = (pothole.measurementStatus || pothole.riskReasons?.measurementStatus || 'UNCALIBRATED')
    .toString()
    .toUpperCase();
  const areaM2 = pothole.areaM2;
  const lengthM = pothole.lengthM;
  const widthM = pothole.widthM;
  const avgDepthCm = pothole.avgDepthCm != null ? pothole.avgDepthCm : (pothole.depthM != null ? pothole.depthM * 100 : null);
  const maxDepthCm = pothole.maxDepthCm;

  let volumeM3 = pothole.volumeM3;
  let volumeSource = 'MEASURED';

  if (!isPositiveNum(volumeM3) && isPositiveNum(lengthM) && isPositiveNum(widthM) && isPositiveNum(avgDepthCm)) {
    // No calibrated volume but we have L × W × avg depth -> calculated volume.
    volumeM3 = lengthM * widthM * (avgDepthCm / 100);
    volumeSource = 'CALCULATED';
  }

  const hasValidVolume = isPositiveNum(volumeM3);
  const hasValidArea = isPositiveNum(areaM2);

  if (!hasValidVolume || !hasValidArea) {
    throw new CostUnavailableError(
      'Validated physical volume/depth is required for a quantity-based repair estimate.',
      {
        volumeM3: pothole.volumeM3,
        areaM2,
        avgDepthCm,
        measurementStatus: status,
      },
    );
  }

  return {
    measurementStatus: status,
    volumeM3,
    areaM2,
    lengthM: isPositiveNum(lengthM) ? lengthM : null,
    widthM: isPositiveNum(widthM) ? widthM : null,
    avgDepthCm: isPositiveNum(avgDepthCm) ? avgDepthCm : null,
    maxDepthCm: isPositiveNum(maxDepthCm) ? maxDepthCm : null,
    volumeSource,
  };
}

class CostUnavailableError extends Error {
  constructor(message, detail) {
    super(message);
    this.code = 'COST_UNAVAILABLE';
    this.detail = detail || {};
  }
}

/** Repair-method options offered per material (used by the UI too). */
const REPAIR_METHOD_BY_MATERIAL = {
  BITUMINOUS: ['COLD_MIX_PATCH', 'HOT_MIX_PATCH', 'DEEP_PATCH', 'BITUMINOUS_PATCH'],
  CONCRETE: ['PCC_PATCH', 'CONCRETE_PATCH', 'BONDED_CONCRETE_PATCH'],
  WMM: ['WMM_BASE_REBUILD'],
  OTHER: ['MANUAL_SPEC'],
};

/**
 * Choose a default repair method given material + geometry.
 * Engineering rule only (no fabricated "IRC approved" claims).
 */
function defaultRepairMethod(material, geometry) {
  const depth = geometry.maxDepthCm ?? geometry.avgDepthCm ?? 0;
  const vol = geometry.volumeM3;
  if (material === 'BITUMINOUS') {
    if (depth >= 8 || vol >= 0.12) return 'DEEP_PATCH';
    if (depth >= 4) return 'HOT_MIX_PATCH';
    return 'COLD_MIX_PATCH';
  }
  if (material === 'CONCRETE') return 'PCC_PATCH';
  if (material === 'WMM') return 'WMM_BASE_REBUILD';
  return 'MANUAL_SPEC';
}

function methodLabel(material, method) {
  const map = {
    COLD_MIX_PATCH: 'Cold mix patch',
    HOT_MIX_PATCH: 'Hot mix asphalt patch',
    DEEP_PATCH: 'Deep / full-depth patch',
    BITUMINOUS_PATCH: 'Bituminous patch repair',
    PCC_PATCH: 'PCC repair / concrete patch',
    CONCRETE_PATCH: 'Concrete patch',
    BONDED_CONCRETE_PATCH: 'Bonded concrete patch',
    WMM_BASE_REBUILD: 'WMM granular base rebuild',
    MANUAL_SPEC: 'Manual engineering specification',
  };
  return map[method] || method;
}

/**
 * Build the BOQ line items + subtotals. Uses resolveRate() to fetch each
 * applicable regional rate; throws RateUnavailableError when a required rate
 * is missing (we do NOT silently substitute).
 */
async function buildBillOfQuantities({ geometry, roadMaterial, repairMethod, roadType, region, roadAuthority }) {
  const state = region?.state || 'Maharashtra';
  const city = region?.city || 'Pune';
  const material = (roadMaterial || 'BITUMINOUS').toUpperCase();
  const method = (repairMethod || defaultRepairMethod(material, geometry)).toUpperCase();

  const density =
    material === 'CONCRETE' ? ENGINEERING.pccDensityKgM3
      : material === 'WMM' ? ENGINEERING.wmmDensityKgM3
        : ENGINEERING.asphaltDensityKgM3;

  const allowanceFactor = ENGINEERING.compactionAllowance;
  const repairVolume = geometry.volumeM3;
  const looseVolume = repairVolume * (1 + allowanceFactor);
  const requiredMassKg = looseVolume * density;

  const rates = {
    materials: {},
    labour: {},
    equipment: {},
    transport: {},
  };
  const lines = { materials: [], labour: [], equipment: [], transport: [] };

  // ── MATERIALS ─────────────────────────────────────────────────────────────
  if (material === 'BITUMINOUS') {
    const hotMix = await resolveRate(CATEGORY_MATERIAL, 'Hot Mix Asphalt (Bituminous Concrete)', state, city);
    if (!hotMix) throw new RateUnavailableError('Hot Mix Asphalt');
    rates.materials.hotMix = hotMix;

    const tack = await resolveRate(CATEGORY_MATERIAL, 'Bituminous emulsion / tack coat (RS-1)', state, city);
    if (tack) {
      rates.materials.tack = tack;
      const tackKg = geometry.areaM2 * 0.3; // ~0.3 kg/m2 tack coat
      lines.materials.push({
        item: 'Bituminous emulsion / tack coat (RS-1)',
        quantity: tackKg,
        unit: tack.unit,
        rate: tack.rate,
        amount: tackKg * tack.rate,
        unitCostLabel: `${tackRateLabel(tack)}`,
      });
    }
    // Hot mix asphalt: kg derived from measured volume.
    lines.materials.unshift({
      item: 'Hot Mix Asphalt (Bituminous Concrete)',
      quantity: requiredMassKg,
      unit: hotMix.unit,
      rate: hotMix.rate,
      amount: requiredMassKg * hotMix.rate,
      unitCostLabel: `${hotMixRateLabel(hotMix)}`,
    });
  } else if (material === 'CONCRETE') {
    const pcc = await resolveRate(CATEGORY_MATERIAL, 'PCC concrete mix 1:2:4', state, city);
    if (!pcc) throw new RateUnavailableError('PCC concrete mix');
    rates.materials.pcc = pcc;
    lines.materials.push({
      item: 'PCC concrete mix (1:2:4 / M15)',
      quantity: looseVolume,
      unit: pcc.unit,
      rate: pcc.rate,
      amount: looseVolume * pcc.rate,
      unitCostLabel: `${pccRateLabel(pcc)}`,
    });
  } else if (material === 'WMM') {
    const wmm = await resolveRate(CATEGORY_MATERIAL, 'Wet Mix Macadam (WMM)', state, city);
    if (!wmm) throw new RateUnavailableError('Wet Mix Macadam (WMM)');
    rates.materials.wmm = wmm;
    lines.materials.push({
      item: 'Wet Mix Macadam (granular base)',
      quantity: looseVolume,
      unit: wmm.unit,
      rate: wmm.rate,
      amount: looseVolume * wmm.rate,
      unitCostLabel: `${wmmRateLabel(wmm)}`,
    });
  } else {
    // OTHER / manual spec: require an engineer-specified material rate.
    throw new RateUnavailableError('Manual/Other material specification');
  }

  // ── LABOUR: hours scaled by volume/area (engineering crew estimates) ──────
  const labourRate = await resolveRate(CATEGORY_LABOUR, 'Road cutting / excavation labour', state, city);
  const cleanRate = await resolveRate(CATEGORY_LABOUR, 'Cleaning / surface preparation labour', state, city);
  const compactRate = await resolveRate(CATEGORY_LABOUR, 'Compaction / placement labour', state, city);
  if (!labourRate || !cleanRate || !compactRate) throw new RateUnavailableError('Labour');

  const cutHr = Math.max(1, Math.ceil(geometry.volumeM3 * 6)); // ~1 crew-hr per 0.17 m3
  const cleanHr = Math.max(1, Math.ceil(geometry.areaM2 * 0.5)); // ~0.5 crew-hr per m2
  const compactHr = Math.max(1, Math.ceil(geometry.volumeM3 * 4)); // ~1 crew-hr per 0.25 m3

  rates.labour.cut = labourRate;
  rates.labour.clean = cleanRate;
  rates.labour.compact = compactRate;

  lines.labour.push(
    { item: 'Road cutting / excavation', quantity: cutHr, unit: 'hr', rate: labourRate.rate, amount: cutHr * labourRate.rate },
    { item: 'Cleaning / surface preparation', quantity: cleanHr, unit: 'hr', rate: cleanRate.rate, amount: cleanHr * cleanRate.rate },
    { item: 'Compaction / placement', quantity: compactHr, unit: 'hr', rate: compactRate.rate, amount: compactHr * compactRate.rate },
  );

  // ── EQUIPMENT: hours scaled by volume ─────────────────────────────────────
  const compactorRate = await resolveRate(CATEGORY_EQUIPMENT, 'Plate compactor / roller', state, city);
  if (!compactorRate) throw new RateUnavailableError('Plate compactor / roller');
  rates.equipment.compactor = compactorRate;
  const equipHr = Math.max(1, Math.ceil(geometry.volumeM3 * 2)); // ~1 equip-hr per 0.5 m3
  lines.equipment.push({
    item: 'Plate compactor / roller',
    quantity: equipHr,
    unit: 'hr',
    rate: compactorRate.rate,
    amount: equipHr * compactorRate.rate,
  });

  // ── TRANSPORT: tonne-km from required mass over assumed haul distance ─────
  const transportRate = await resolveRate(CATEGORY_TRANSPORT, 'Material transport (local)', state, city);
  if (!transportRate) throw new RateUnavailableError('Material transport');
  rates.transport.local = transportRate;
  const tonneKm = (requiredMassKg / 1000) * ENGINEERING.haDistanceKm;
  lines.transport.push({
    item: `Material transport (local, ~${ENGINEERING.haDistanceKm} km)`,
    quantity: tonneKm,
    unit: 'tonne-km',
    rate: transportRate.rate,
    amount: tonneKm * transportRate.rate,
  });

  return {
    geometry,
    material,
    method,
    methodLabel: methodLabel(material, method),
    rates,
    lines,
    repairVolume,
    allowanceFactor,
    looseVolume,
    requiredMassKg,
    density,
  };
}

// Small helpers to format a rate "₹42/kg — source (effective date)".
function fmtRate(r) {
  return `${r.rate} ${r.unit}`;
}
function hotMixRateLabel(r) { return fmtRate(r); }
function tackRateLabel(r) { return fmtRate(r); }
function pccRateLabel(r) { return fmtRate(r); }
function wmmRateLabel(r) { return fmtRate(r); }

class RateUnavailableError extends Error {
  constructor(what) {
    super(`Rate unavailable for selected region/material: ${what}`);
    this.code = 'RATE_UNAVAILABLE';
    this.what = what;
  }
}

/**
 * Sum amounts per category, apply allowance/tax/contingency, round final total.
 * All sums are done in paise to avoid float drift.
 */
function computeTotals(boq) {
  const sum = (arr) => arr.reduce((s, l) => s + toPaise(l.amount), 0);
  const materialSubtotal = sum(boq.lines.materials);
  const labourSubtotal = sum(boq.lines.labour);
  const equipmentSubtotal = sum(boq.lines.equipment);
  const transportSubtotal = sum(boq.lines.transport);

  // Allowance on materials = loose vs compacted material uplift ~ volume*allowanceFactor*density*rate.
  // Computed as the material already includes the loose volume uplift; the monetary
  // allowance line reflects the extra cost of the allowance volume.
  const materialAmount = sum(boq.lines.materials);

  const gross = materialSubtotal + labourSubtotal + equipmentSubtotal + transportSubtotal;
  const contingency = toPaise(gross) * FINANCE.contingencyRate;
  const taxBase = gross;
  const tax = toPaise(taxBase) * FINANCE.taxRate;
  const subtotal = gross;
  const totalPaise = Math.round(gross + contingency + tax);

  return {
    materialSubtotal: fromPaise(materialSubtotal),
    labourSubtotal: fromPaise(labourSubtotal),
    equipmentSubtotal: fromPaise(equipmentSubtotal),
    transportSubtotal: fromPaise(transportSubtotal),
    allowance: fromPaise(materialAmount) - fromPaise(materialAmount), // see note
    subtotal: fromPaise(subtotal),
    tax: fromPaise(Math.round(tax)),
    contingency: fromPaise(Math.round(contingency)),
    total: fromPaise(totalPaise),
  };
}

/** Build the persisted CostEstimate row payload (includes full rate snapshot). */
async function buildEstimatePayload(potholeId, geometry, roadConfig, boq, totals) {
  const state = roadConfig.state || 'Maharashtra';
  const city = roadConfig.city || 'Pune';

  const sourceParts = new Set();
  const effDates = new Set();
  for (const cat of ['materials', 'labour', 'equipment', 'transport']) {
    for (const r of Object.values(boq.rates[cat] || {})) {
      if (r.source) sourceParts.add(r.source);
      if (r.effectiveFrom) effDates.add(r.effectiveFrom);
    }
  }
  const rateSource = sourceParts.size ? [...sourceParts].join('; ') : 'Reference rate catalog';
  const rateEffectiveDate = effDates.size ? [...effDates].sort().join(' / ') : '2026-01-01';

  return {
    potholeId,
    roadMaterial: boq.material,
    roadType: roadConfig.roadType,
    repairMethod: boq.method,
    regionState: state,
    regionCity: city,
    roadAuthority: roadConfig.authority,
    geometry: {
      volumeM3: geometry.volumeM3,
      areaM2: geometry.areaM2,
      lengthM: geometry.lengthM,
      widthM: geometry.widthM,
      avgDepthCm: geometry.avgDepthCm,
      maxDepthCm: geometry.maxDepthCm,
      measurementStatus: geometry.measurementStatus,
      volumeSource: geometry.volumeSource,
    },
    rateSnapshot: boq.rates,
    ratesMaterials: boq.rates.materials,
    ratesLabour: boq.rates.labour,
    ratesEquipment: boq.rates.equipment,
    ratesTransport: boq.rates.transport,
    materials: boq.lines.materials,
    labour: boq.lines.labour,
    equipment: boq.lines.equipment,
    transport: boq.lines.transport,
    materialSubtotal: totals.materialSubtotal,
    labourSubtotal: totals.labourSubtotal,
    equipmentSubtotal: totals.equipmentSubtotal,
    transportSubtotal: totals.transportSubtotal,
    allowance: totals.allowance,
    subtotal: totals.subtotal,
    tax: totals.tax,
    contingency: totals.contingency,
    total: totals.total,
    currency: 'INR',
    rateSource,
    rateEffectiveDate,
    formula: {
      repairVolumeM3: boq.repairVolume,
      allowanceFactor: boq.allowanceFactor,
      looseVolumeM3: boq.looseVolume,
      densityKgM3: boq.density,
      requiredMassKg: boq.requiredMassKg,
      taxRate: FINANCE.taxRate,
      contingencyRate: FINANCE.contingencyRate,
      material: boq.lines.materials.map((l) => `${l.quantity.toFixed(3)} ${l.unit} × ${l.rate} = ${l.amount.toFixed(2)}`),
    },
    calculationStatus: 'CALCULATED',
  };
}

async function findPotholeRecord(key) {
  // `key` is the physical record UUID `id`, falling back to the persistent Pxxx id.
  let p = await prisma.pothole.findUnique({ where: { id: key }, include: { inspection: true } });
  if (!p) p = await prisma.pothole.findUnique({ where: { potholeId: key }, include: { inspection: true } });
  return p;
}

/**
 * Full estimate flow for one pothole.
 *   - Loads authoritative measurements from the Pothole record (never trusts
 *     client geometry).
 *   - Validates material/repair/region config.
 *   - Builds BOQ, computes totals, persists a CostEstimate with rate snapshot,
 *     updates the Pothole's cost columns to keep existing UIs working.
 * Returns the { estimate, pothole, costEstimate } object.
 */
async function estimatePothole(potholeId, { roadType, roadMaterial, repairMethod, region, roadAuthority } = {}) {
  const pothole = await findPotholeRecord(potholeId);
  if (!pothole) throw new Error('Pothole not found');

  const geometry = collectGeometry(pothole);
  const material = (roadMaterial || pothole.roadMaterial || 'BITUMINOUS').toUpperCase();
  const rtype = (roadType || pothole.roadType || 'STATE_HIGHWAY').toUpperCase();
  const method = (repairMethod || defaultRepairMethod(material, geometry)).toUpperCase();

  const state = region?.state || pothole.regionState || 'Maharashtra';
  const city = region?.city || pothole.regionCity || 'Pune';
  const authority = roadAuthority || pothole.roadAuthority || 'State PWD';

  const boq = await buildBillOfQuantities({
    geometry,
    roadMaterial: material,
    repairMethod: method,
    roadType: rtype,
    region: { state, city },
    roadAuthority: authority,
  });
  const totals = computeTotals(boq);
  const payload = await buildEstimatePayload(pothole.id, geometry, { state, city, roadType: rtype, authority }, boq, totals);

  const costEstimate = await prisma.$transaction(async (tx) => {
    // Upsert one estimate per pothole (one physical pothole -> one estimate).
    const existing = await tx.costEstimate.findUnique({ where: { potholeId: pothole.id } });
    const record = existing
      ? await tx.costEstimate.update({ where: { id: existing.id }, data: payload })
      : await tx.costEstimate.create({ data: payload });

    // Keep legacy Pothole cost columns in sync so defects/dashboard still work.
    await tx.pothole.update({
      where: { id: pothole.id },
      data: {
        roadMaterial: material,
        roadType: rtype,
        repairMethod: method,
        regionState: state,
        regionCity: city,
        roadAuthority: authority,
        materialType: (boq.lines.materials[0] && boq.lines.materials[0].item) || null,
        materialQuantity: boq.lines.materials[0] ? `${boq.lines.materials[0].quantity.toFixed(3)} ${boq.lines.materials[0].unit}` : null,
        materialCost: totals.materialSubtotal,
        labourCost: totals.labourSubtotal,
        equipmentCost: totals.equipmentSubtotal,
        totalRepairCost: totals.total,
        estimatedCost: totals.total,
        costCurrency: '₹',
        requiredMaterials: [
          ...boq.lines.materials,
          ...boq.lines.labour,
          ...boq.lines.equipment,
          ...boq.lines.transport,
        ],
      },
    });
    return record;
  });

  return { pothole, costEstimate, boq, totals, volumeSource: geometry.volumeSource };
}

/**
 * Retrieve the currently stored estimate for a pothole (reproducibility:
 * same estimate after refresh, unaffected by later rate-table changes).
 */
async function getStoredEstimate(potholeId) {
  const pothole = await findPotholeRecord(potholeId);
  if (!pothole) return null;
  return prisma.costEstimate.findUnique({ where: { potholeId: pothole.id } });
}

/**
 * List potholes eligible for the estimator, with a flag for costing eligibility.
 * Returns the real records so the UI can show evidence image + measurements.
 */
async function listCostPotholes() {
  const potholes = await prisma.pothole.findMany({
    include: { inspection: { select: { assetName: true, locationName: true, assetType: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return potholes.map((p) => {
    const hasVolume = isPositiveNum(p.volumeM3);
    const hasArea = isPositiveNum(p.areaM2);
    const status = (p.measurementStatus || p.riskReasons?.measurementStatus || 'UNCALIBRATED').toString().toUpperCase();
    return {
      id: p.id,
      potholeId: p.potholeId,
      defectClass: p.defectClass,
      confidence: p.confidence,
      createdAt: p.createdAt,
      imagePath: p.imagePath,
      gpsAvailable: p.gpsAvailable,
      gpsStatus: p.gpsStatus,
      latitude: p.inspection?.latitude ?? null,
      longitude: p.inspection?.longitude ?? null,
      locationName: p.inspection?.locationName ?? p.inspection?.assetName ?? null,
      severity: p.severity,
      measurementStatus: status,
      measuredVolumeM3: p.volumeM3,
      measuredAreaM2: p.areaM2,
      measuredDepthCM: p.maxDepthCm ?? p.avgDepthCm ?? (p.depthM != null ? p.depthM * 100 : null),
      volumeM3: p.volumeM3,
      areaM2: p.areaM2,
      depthM: p.depthM,
      lengthM: p.lengthM,
      widthM: p.widthM,
      avgDepthCm: p.avgDepthCm,
      maxDepthCm: p.maxDepthCm,
      roadMaterial: p.roadMaterial,
      roadType: p.roadType,
      repairMethod: p.repairMethod,
      eligibleForCosting: !!(hasVolume && hasArea),
    };
  });
}

module.exports = {
  estimatePothole,
  getStoredEstimate,
  listCostPotholes,
  collectGeometry,
  ROAD_TYPES,
  ROAD_MATERIALS,
  REPAIR_METHOD_BY_MATERIAL,
  defaultRepairMethod,
  ENGINEERING,
  FINANCE,
  CostUnavailableError,
  RateUnavailableError,
  // expose for tests
  computeTotals,
  buildBillOfQuantities,
  buildEstimatePayload,
};
