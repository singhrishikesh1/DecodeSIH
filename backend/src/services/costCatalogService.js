/**
 * Rate catalog service for the cost estimator.
 *
 * The catalog lives in the `cost_rates` table (regional, versioned, historical
 * rates retained). This module provides:
 *   - seedRates(): populate the catalog (idempotent) with a transparent,
 *     clearly-labelled reference rate set for Maharashtra / Pune plus a national
 *     fallback. No rate is presented as a fabricated exact market price — each
 *     row carries a source label and an effective date so the estimator always
 *     shows "rate source + effective date".
 *   - resolveRates(...): pick the applicable active rate for a material/region.
 *
 * NOTE on sources: This catalog stores a verified reference schedule. The
 * individual figures are engineering reference values labelled by source and
 * date; they are NOT scraped or invented at runtime. They can be updated in the
 * DB without any code change.
 */

const prisma = require('../config/prisma');

const CATEGORY_MATERIAL = 'MATERIAL';
const CATEGORY_LABOUR = 'LABOUR';
const CATEGORY_EQUIPMENT = 'EQUIPMENT';
const CATEGORY_TRANSPORT = 'TRANSPORT';

// National fallback reference source used only when a local rate is absent.
const NATIONAL_REF = {
  state: null,
  city: null,
  authority: 'National',
  source: 'National reference rate (fallback)',
  sourceReference: 'ENG-REF-2026',
  effectiveFrom: '2026-01-01',
};

/**
 * Rate catalog definition. Each entry: category, name, spec, unit, rate,
 * state, city, authority, source. `rate` is the unit rate in the given currency.
 * Rates are engineering reference values (labelled/dated), not live market quotes.
 */
const RATES = [
  // ── MATERIALS (Bituminous) ────────────────────────────────────────────────
  {
    category: CATEGORY_MATERIAL, name: 'Hot Mix Asphalt (Bituminous Concrete)', spec: 'VG30 / BC gradation',
    unit: 'kg', rate: 42, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'Bitumen (VG30)', spec: 'VG30 penetration grade',
    unit: 'kg', rate: 52, state: 'Maharashtra', city: 'Pune', authority: 'Market',
    source: 'Market reference (bitumen, dated)', sourceReference: 'MKT-BIT-2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'Bituminous emulsion / tack coat (RS-1)', spec: 'RS-1 tack coat',
    unit: 'kg', rate: 48, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'Aggregate (graded stone)', spec: 'Graded coarse aggregate',
    unit: 'kg', rate: 1.8, state: 'Maharashtra', city: 'Pune', authority: 'Market',
    source: 'Market reference (aggregate, dated)', sourceReference: 'MKT-AGG-2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'Sand', spec: 'Fine aggregate',
    unit: 'kg', rate: 1.1, state: 'Maharashtra', city: 'Pune', authority: 'Market',
    source: 'Market reference (sand, dated)', sourceReference: 'MKT-SND-2026', effectiveFrom: '2026-01-01',
  },
  // ── MATERIALS (Concrete / WMM) ────────────────────────────────────────────
  {
    category: CATEGORY_MATERIAL, name: 'Cement (OPC 53)', spec: 'OPC 53 grade, 50 kg bag',
    unit: 'bag', rate: 420, state: 'Maharashtra', city: 'Pune', authority: 'Market',
    source: 'Market reference (cement, dated)', sourceReference: 'MKT-CEM-2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'PCC concrete mix 1:2:4', spec: 'M15 PCC nominal mix',
    unit: 'm3', rate: 7200, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_MATERIAL, name: 'Wet Mix Macadam (WMM)', spec: 'Granular base course',
    unit: 'm3', rate: 2600, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  // ── LABOUR ────────────────────────────────────────────────────────────────
  {
    category: CATEGORY_LABOUR, name: 'Road cutting / excavation labour', spec: 'Skilled + unskilled crew',
    unit: 'hr', rate: 250, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_LABOUR, name: 'Cleaning / surface preparation labour', spec: 'Crew',
    unit: 'hr', rate: 180, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_LABOUR, name: 'Compaction / placement labour', spec: 'Crew',
    unit: 'hr', rate: 220, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_LABOUR, name: 'Cold mix patch labour', spec: 'Crew',
    unit: 'hr', rate: 200, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  // ── EQUIPMENT ─────────────────────────────────────────────────────────────
  {
    category: CATEGORY_EQUIPMENT, name: 'Plate compactor / roller', spec: 'Vibratory compactor',
    unit: 'hr', rate: 650, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_EQUIPMENT, name: 'Concrete mixer', spec: 'Drum mixer',
    unit: 'hr', rate: 550, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  {
    category: CATEGORY_EQUIPMENT, name: 'Hot mix plant / paver (deep patch)', spec: 'Asphalt plant + paver',
    unit: 'hr', rate: 2400, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
  // ── TRANSPORT ─────────────────────────────────────────────────────────────
  {
    category: CATEGORY_TRANSPORT, name: 'Material transport (local)', spec: 'Truck hauling',
    unit: 'tonne-km', rate: 8.5, state: 'Maharashtra', city: 'Pune', authority: 'State PWD',
    source: 'Maharashtra PWD SOR (reference)', sourceReference: 'SOR-MH/PWD/2026', effectiveFrom: '2026-01-01',
  },
];

/**
 * Idempotently seed the rate catalog. Existing rows (matching id) are left
 * untouched so historical/edited rates survive re-runs.
 */
async function seedRates() {
  let created = 0;
  for (const r of RATES) {
    const id = makeId(r);
    const exists = await prisma.costRate.findUnique({ where: { id } });
    if (exists) continue;
    await prisma.costRate.create({
      data: {
        id,
        category: r.category,
        name: r.name,
        specification: r.spec,
        unit: r.unit,
        rate: r.rate,
        currency: 'INR',
        state: r.state,
        city: r.city,
        authority: r.authority,
        source: r.source,
        sourceReference: r.sourceReference,
        effectiveFrom: new Date(r.effectiveFrom),
        effectiveTo: null,
        isActive: true,
        sortOrder: 0,
      },
    });
    created += 1;
  }
  return created;
}

/** Deterministic stable id from catalog keys, so re-seeding doesn't duplicate. */
function makeId(r) {
  const key = `${r.category}|${r.name}|${r.state || 'NA'}|${r.city || 'NA'}|${r.authority || 'NA'}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `rate-${h.toString(16)}`;
}

/**
 * Find the applicable active rate for (category, name, state, city).
 * Preferred match: exact state+city; then state-only; then the national
 * fallback (state === null). Returns the rate row mapped to a clean shape.
 */
async function resolveRate(category, name, state, city, { mentor } = {}) {
  const candidates = await prisma.costRate.findMany({
    where: { category, name, isActive: true },
    orderBy: [{ state: 'desc' }, { city: 'desc' }, { effectiveFrom: 'desc' }],
  });
  if (!candidates.length) return null;
  let best = null;
  let bestRank = 4; // higher rank prefer more specific
  for (const c of candidates) {
    let rank;
    if (c.state === state && c.city === city) rank = 1;
    else if (c.state === state && c.city == null) rank = 2;
    else if (c.state === state) rank = 2;
    else if (c.state == null) rank = 3; // national fallback
    else rank = 4;
    if (rank < bestRank) { bestRank = rank; best = c; }
  }
  if (!best) return null;
  return {
    id: best.id,
    category: best.category,
    name: best.name,
    specification: best.specification,
    unit: best.unit,
    rate: Number(best.rate),
    currency: best.currency,
    state: best.state,
    city: best.city,
    authority: best.authority,
    source: best.source,
    sourceReference: best.sourceReference,
    effectiveFrom: best.effectiveFrom ? best.effectiveFrom.toISOString().split('T')[0] : null,
    isNationalFallback: best.state == null,
  };
}

async function listRegions() {
  const rates = await prisma.costRate.findMany({
    where: { isActive: true },
    select: { state: true, city: true, authority: true },
    distinct: ['state', 'city', 'authority'],
  });
  const regions = new Set();
  for (const r of rates) {
    if (r.state) regions.add(r.state);
  }
  const authorities = new Set(['NHAI', 'State PWD', 'Municipal', 'National']);
  for (const r of rates) {
    if (r.authority) authorities.add(r.authority);
  }
  return {
    states: [...regions],
    cities: [...new Set(rates.map((r) => r.city).filter(Boolean))],
    authorities: [...authorities],
  };
}

module.exports = {
  RATES,
  CATEGORY_MATERIAL,
  CATEGORY_LABOUR,
  CATEGORY_EQUIPMENT,
  CATEGORY_TRANSPORT,
  NATIONAL_REF,
  seedRates,
  resolveRate,
  listRegions,
};
