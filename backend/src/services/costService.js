/**
 * Simple deterministic cost estimation service.
 * No ML — just configurable rates applied to measured volume/area.
 */

const DEFAULT_RATES = {
  materialRate: 14500,   // per m³
  labourRate: 3000,      // per job
  equipmentRate: 2500,   // per job
  transportRate: 1500,   // per job
  contingencyRate: 0.1,  // 10%
};

function estimateCost({ volumeM3, areaM2, assetType, config }) {
  const rates = config || DEFAULT_RATES;
  const volume = volumeM3 || 0;
  const area = areaM2 || 0;

  const materialCost = volume * (rates.materialRate || DEFAULT_RATES.materialRate);
  const labourCost = rates.labourRate || DEFAULT_RATES.labourRate;
  const equipmentCost = rates.equipmentRate || DEFAULT_RATES.equipmentRate;
  const transportCost = rates.transportRate || DEFAULT_RATES.transportRate;
  const subtotal = materialCost + labourCost + equipmentCost + transportCost;
  const contingency = subtotal * (rates.contingencyRate || DEFAULT_RATES.contingencyRate);
  const total = Math.round(subtotal + contingency);

  return {
    total_estimated_cost: total,
    currency: '₹',
    breakdown: {
      material: Math.round(materialCost),
      labour: labourCost,
      equipment: equipmentCost,
      transport: transportCost,
      contingency: Math.round(contingency),
    },
    formula: `volume(${volume}m³) × rate(${rates.materialRate}/m³) + labour + equipment + transport + contingency`,
  };
}

module.exports = { estimateCost, DEFAULT_RATES };
