const prisma = require('../config/prisma');

/**
 * Maps a Prisma inspection+pothole record to the legacy frontend Defect shape.
 * This preserves backward compatibility with the React frontend.
 */
function inspectionToDefect(inspection) {
  const p = inspection.potholes && inspection.potholes[0];

  const riskLevel = p?.severity || 'LOW';
  const riskScore = p?.riskScore || 0;

  const volumetric = p
    ? {
        volume_m3: p.volumeM3 || 0,
        surface_area_m2: p.areaM2 || 0,
        avg_depth_cm: p.depthM ? parseFloat((p.depthM * 100).toFixed(1)) : 0,
        max_depth_cm: p.depthM ? parseFloat((p.depthM * 100 * 1.3).toFixed(1)) : 0,
        length_m: p.lengthM || 0,
        width_m: p.widthM || 0,
      }
    : {
        volume_m3: 0,
        surface_area_m2: 0,
        avg_depth_cm: 0,
        max_depth_cm: 0,
        length_m: 0,
        width_m: 0,
      };

  const costEstimation = p
    ? {
        total_estimated_cost: p.estimatedCost || 0,
        currency: p.costCurrency || '₹',
        required_materials: Array.isArray(p.requiredMaterials) ? p.requiredMaterials : [],
        recommended_action: p.recommendedAction || 'Perform field inspection and repair.',
        risk_score: riskLevel,
        risk_numeric: riskScore,
        risk_reasons: Array.isArray(p.riskReasons) ? p.riskReasons : [],
      }
    : {
        total_estimated_cost: 0,
        currency: '₹',
        required_materials: [],
        recommended_action: 'Perform field inspection and repair.',
        risk_score: riskLevel,
        risk_numeric: riskScore,
        risk_reasons: [],
      };

  return {
    // Legacy shape (Rishi frontend consumes these)
    id: inspection.legacyId || inspection.id,
    title: inspection.title || `${p?.defectClass || 'Defect'} Detected`,
    assetName: inspection.assetName,
    assetType: inspection.assetType,
    locationName: inspection.locationName || '',
    lat: inspection.latitude != null ? inspection.latitude : null,
    lng: inspection.longitude != null ? inspection.longitude : null,
    altitude: inspection.altitude != null ? inspection.altitude : null,
    riskLevel: riskLevel,
    riskScore: riskScore,
    defectClass: p?.defectClass || 'Unknown',
    confidence: p?.confidence || 0,
    volumetric,
    costEstimation,
    riskReasons: Array.isArray(p?.riskReasons) ? p.riskReasons : [],
    timestamp: inspection.timestamp ? inspection.timestamp.toISOString() : inspection.createdAt.toISOString(),
    inspector: inspection.inspector || 'System',
    status: inspection.status,
    alertSent: inspection.alertSent || false,
    thumbnailUrl: inspection.thumbnailUrl || p?.imagePath || '',

    // Additive fields from the database (source of truth)
    potholeId: p?.potholeId || null,
    gpsAvailable: p ? p.gpsAvailable : false,
    gpsStatus: p?.gpsStatus || 'unavailable',
    costBreakdown: p
      ? {
          materialType: p.materialType || null,
          materialQuantity: p.materialQuantity || null,
          materialCost: p.materialCost,
          labourCost: p.labourCost,
          equipmentCost: p.equipmentCost,
          totalRepairCost: p.totalRepairCost,
          currency: p.costCurrency || '₹',
        }
      : null,
    imageUrl: p?.imagePath || null,
  };
}

async function getAllDefects(filters = {}) {
  const where = {};
  if (filters.assetType && filters.assetType !== 'all') {
    where.assetType = filters.assetType.toLowerCase();
  }

  const inspections = await prisma.inspection.findMany({
    where,
    include: { potholes: true },
    orderBy: { timestamp: 'desc' },
  });

  let defects = inspections.map(inspectionToDefect);

  if (filters.riskLevel && filters.riskLevel !== 'all') {
    defects = defects.filter(
      (d) => d.riskLevel.toUpperCase() === filters.riskLevel.toUpperCase()
    );
  }

  return defects;
}

async function getDefectById(id) {
  // Try legacyId first, then raw uuid
  let inspection = await prisma.inspection.findUnique({
    where: { legacyId: id },
    include: { potholes: true },
  });

  if (!inspection) {
    inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { potholes: true },
    });
  }

  if (!inspection) return null;
  return inspectionToDefect(inspection);
}

async function updateDefectStatus(id, newStatus) {
  // Find by legacyId first
  let inspection = await prisma.inspection.findUnique({
    where: { legacyId: id },
  });

  if (!inspection) {
    inspection = await prisma.inspection.findUnique({ where: { id } });
  }

  if (!inspection) return null;

  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { status: newStatus },
  });

  return getDefectById(id);
}

async function getAnalyticsSummary() {
  const inspections = await prisma.inspection.findMany({
    include: { potholes: true },
  });

  const totalInspections = inspections.length;
  const criticalRisks = inspections.filter((i) =>
    i.potholes.some((p) => p.severity === 'CRITICAL')
  ).length;
  const highRisks = inspections.filter((i) =>
    i.potholes.some((p) => p.severity === 'HIGH')
  ).length;
  const resolvedProblems = inspections.filter(
    (i) => i.status === 'RESOLVED'
  ).length;
  const totalEstimatedBudget = inspections.reduce((acc, i) => {
    const cost = i.potholes.reduce((sum, p) => sum + (p.estimatedCost || 0), 0);
    return acc + cost;
  }, 0);

  const byAssetType = {
    road: inspections.filter((i) => i.assetType === 'road').length,
    bridge: inspections.filter((i) => i.assetType === 'bridge').length,
    railway: inspections.filter((i) => i.assetType === 'railway').length,
    building: inspections.filter((i) => i.assetType === 'building').length,
  };

  return {
    totalInspections,
    criticalRisks,
    highRisks,
    resolvedProblems,
    totalEstimatedBudget,
    currency: '₹',
    byAssetType,
  };
}

module.exports = {
  inspectionToDefect,
  getAllDefects,
  getDefectById,
  updateDefectStatus,
  getAnalyticsSummary,
};
