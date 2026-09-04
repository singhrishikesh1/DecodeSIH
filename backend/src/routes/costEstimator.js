const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const {
  seedRates,
  resolveRate,
  listRegions,
  CATEGORY_MATERIAL,
  CATEGORY_LABOUR,
  CATEGORY_EQUIPMENT,
  CATEGORY_TRANSPORT,
} = require('../services/costCatalogService');
const {
  estimatePothole,
  getStoredEstimate,
  listCostPotholes,
  ROAD_TYPES,
  ROAD_MATERIALS,
  REPAIR_METHOD_BY_MATERIAL,
  defaultRepairMethod,
  CostUnavailableError,
  RateUnavailableError,
} = require('../services/costEstimateService');

// Ensure the catalog has at least the seed rates (idempotent).
async function ensureSeeded() {
  try {
    await seedRates();
  } catch (e) {
    console.error('[costEstimator] rate seed failed:', e.message);
  }
}
ensureSeeded();

// GET /api/cost-estimator/potholes — real potholes for costing.
router.get('/potholes', async (_req, res) => {
  try {
    const data = await listCostPotholes();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cost-estimator/options — rate regions, authorities, materials, methods.
router.get('/options', async (_req, res) => {
  try {
    const regions = await listRegions();
    res.json({
      success: true,
      data: {
        regions,
        roadTypes: ROAD_TYPES,
        roadMaterials: ROAD_MATERIALS,
        repairMethodsByMaterial: REPAIR_METHOD_BY_MATERIAL,
        engineering: {
          asphaltDensityKgM3: 2200,
          compactionAllowance: 0.08,
          haDistanceKm: 15,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cost-estimator/rates — applicable rates (filter optional).
router.get('/rates', async (req, res) => {
  try {
    const { state, city, category } = req.query;
    const where = { isActive: true };
    if (category) where.category = category.toUpperCase();
    const rates = await prisma.costRate.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    res.json({ success: true, count: rates.length, data: rates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cost-estimator/:potholeId/estimate — stored (reproducible) estimate.
router.get('/:potholeId/estimate', async (req, res) => {
  try {
    const estimate = await getStoredEstimate(req.params.potholeId);
    if (!estimate) {
      return res.json({ success: true, data: null });
    }
    res.json({ success: true, data: estimate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/cost-estimator/calculate
// The backend loads authoritative measurements from the Pothole record; it
// never trusts client-provided volume/area/depth when they already exist in DB.
router.post('/calculate', async (req, res) => {
  const { potholeId, roadType, roadMaterial, repairMethod, region, roadAuthority } = req.body || {};
  if (!potholeId) {
    return res.status(400).json({ success: false, error: 'potholeId is required' });
  }
  try {
    const result = await estimatePothole(potholeId, {
      roadType,
      roadMaterial,
      repairMethod,
      region,
      roadAuthority,
    });
    const ce = result.costEstimate;
    const pothole = result.pothole;
    res.json({
      success: true,
      data: {
        potholeId: pothole.potholeId,
        pothole: {
          id: pothole.id,
          potholeId: pothole.potholeId,
          imagePath: pothole.imagePath,
          confidence: pothole.confidence,
          latitude: pothole.inspection?.latitude ?? null,
          longitude: pothole.inspection?.longitude ?? null,
          locationName: pothole.inspection?.locationName ?? pothole.inspection?.assetName ?? null,
        },
        geometry: ce.geometry,
        road: {
          material: ce.roadMaterial,
          roadType: ce.roadType,
          region: ce.regionState,
          state: ce.regionState,
          city: ce.regionCity,
          authority: ce.roadAuthority,
        },
        repair: {
          method: ce.repairMethod,
          compactionAllowance: result.boq.allowanceFactor,
          densityKgM3: result.boq.density,
          requiredMassKg: result.boq.requiredMassKg,
          looseVolumeM3: result.boq.looseVolume,
        },
        materials: ce.materials,
        labour: ce.labour,
        equipment: ce.equipment,
        transport: ce.transport,
        materialSubtotal: ce.materialSubtotal,
        labourSubtotal: ce.labourSubtotal,
        equipmentSubtotal: ce.equipmentSubtotal,
        transportSubtotal: ce.transportSubtotal,
        allowance: ce.allowance,
        subtotal: ce.subtotal,
        tax: ce.tax,
        contingency: ce.contingency,
        totalEstimatedCost: ce.total,
        currency: ce.currency,
        rateSource: ce.rateSource,
        rateEffectiveDate: ce.rateEffectiveDate,
        formula: ce.formula,
        calculationStatus: ce.calculationStatus,
        storedEstimateId: ce.id,
      },
    });
  } catch (err) {
    if (err instanceof CostUnavailableError) {
      return res.status(200).json({
        success: false,
        code: 'COST_UNAVAILABLE',
        message: err.message,
        data: { geometry: err.detail },
      });
    }
    if (err instanceof RateUnavailableError) {
      return res.status(200).json({
        success: false,
        code: 'RATE_UNAVAILABLE',
        message: err.message,
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
