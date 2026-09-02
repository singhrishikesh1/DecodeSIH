const prisma = require('../config/prisma');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AI_SERVICE_HOST = process.env.AI_SERVICE_HOST || 'localhost';
const AI_SERVICE_PORT = parseInt(process.env.AI_SERVICE_PORT || '5001', 10);
const AI_TIMEOUT_MS = 30000;

const POTHOLES_IMAGES_DIR = path.join(__dirname, '../../uploads/potholes');

/**
 * Call the Python AI engine (ai_engine/app.py on :5001/api/ai/analyze).
 * The engine accepts raw image bytes via POST and returns
 * { success: true, data: { defect_class, confidence, bounding_box,
 *   annotated_image_base64, volumetric_data, cost_estimation, risk_summary } }.
 * Returns null if the service is unavailable / malformed.
 */
async function callAIService(imagePath, assetType) {
  return new Promise((resolve) => {
    let bodyBuffer;
    let contentType;

    if (imagePath && fs.existsSync(imagePath)) {
      bodyBuffer = fs.readFileSync(imagePath);
      contentType = 'image/jpeg';
    } else {
      bodyBuffer = Buffer.from(JSON.stringify({ asset_type: assetType || 'road' }));
      contentType = 'application/json';
    }

    const req = http.request(
      {
        hostname: AI_SERVICE_HOST,
        port: AI_SERVICE_PORT,
        path: `/api/ai/analyze?asset_type=${encodeURIComponent(assetType || 'road')}`,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': bodyBuffer.length,
        },
        timeout: AI_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.success && parsed.data) {
              resolve(parsed.data);
            } else {
              console.error(
                `[Backend aiServiceV2]: AI engine error:`,
                parsed.error || 'unknown'
              );
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error(
        `[Backend aiServiceV2]: AI engine unavailable on ${AI_SERVICE_HOST}:${AI_SERVICE_PORT}: ${err.message}`
      );
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * Persist a pothole from the AI engine result, applying all definition-of-done
 * rules: persistent P001 ID, GPS-optional handling, cost breakdown, severity
 * & risk from backend/AI, and saving the actual annotated image.
 */
async function persistPothole(tx, inspection, aiData) {
  // ── Persistent pothole ID ────────────────────────────────────────────────
  const seq = await tx.potholeSequence.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', current: 0 },
  });
  const next = seq.current + 1;
  await tx.potholeSequence.update({
    where: { id: 'default' },
    data: { current: next },
  });
  const potholeId = 'P' + String(next).padStart(3, '0');

  // ── Volumetric data ──────────────────────────────────────────────────────
  const vol = aiData.volumetric_data || {};
  const areaM2 = vol.surface_area_m2 != null ? vol.surface_area_m2 : null;
  const depthCM = vol.max_depth_cm != null ? vol.max_depth_cm : vol.avg_depth_cm;
  const depthM = depthCM != null ? depthCM / 100 : null;

  // ── Cost estimation ──────────────────────────────────────────────────────
  const cost = aiData.cost_estimation || {};
  const requiredMaterials = Array.isArray(cost.required_materials)
    ? cost.required_materials
    : null;
  const materialCost =
    requiredMaterials && requiredMaterials.length > 0
      ? requiredMaterials.reduce((sum, m) => sum + (Number(m.cost) || 0), 0)
      : null;
  const totalRepairCost = cost.total_estimated_cost != null ? cost.total_estimated_cost : null;
  const materialsSummary = requiredMaterials && requiredMaterials.length > 0
    ? requiredMaterials[0]
    : null;

  // ── Risk / severity (single source of truth = backend/AI) ───────────────
  const riskSummary = aiData.risk_summary || {};
  const riskScore = riskSummary.score != null ? riskSummary.score : cost.risk_numeric;
  const severity = (riskSummary.level || cost.risk_score || 'MEDIUM').toUpperCase();
  const riskReasons = Array.isArray(riskSummary.reasons)
    ? riskSummary.reasons
    : Array.isArray(cost.risk_reasons)
      ? cost.risk_reasons
      : [];

  // ── Save actual annotated image ──────────────────────────────────────────
  let imagePath = null;
  const b64Match =
    typeof aiData.annotated_image_base64 === 'string' &&
    /^data:image\/(jpeg|png);base64,/.test(aiData.annotated_image_base64);
  if (b64Match) {
    try {
      if (!fs.existsSync(POTHOLES_IMAGES_DIR)) {
        fs.mkdirSync(POTHOLES_IMAGES_DIR, { recursive: true });
      }
      const ext = aiData.annotated_image_base64.includes('image/png') ? 'png' : 'jpg';
      const filename = `pothole_${potholeId}.${ext}`;
      const base64Data = aiData.annotated_image_base64.split(',')[1];
      fs.writeFileSync(path.join(POTHOLES_IMAGES_DIR, filename), Buffer.from(base64Data, 'base64'));
      imagePath = `/uploads/potholes/${filename}`;
    } catch (err) {
      console.error(`[Backend aiServiceV2]: Failed to save pothole image: ${err.message}`);
    }
  }

  // ── GPS-optional handling ─────────────────────────────────────────────────
  const hasGps =
    inspection.latitude != null &&
    inspection.longitude != null &&
    !Number.isNaN(Number(inspection.latitude)) &&
    !Number.isNaN(Number(inspection.longitude));

  const pothole = await tx.pothole.create({
    data: {
      potholeId,
      inspectionId: inspection.id,
      defectClass: aiData.defect_class || 'Pothole',
      confidence: aiData.confidence != null ? Number(aiData.confidence) : null,
      areaM2,
      depthM,
      depthType: 'estimated',
      volumeM3: vol.volume_m3 != null ? vol.volume_m3 : null,
      lengthM: vol.length_m != null ? vol.length_m : null,
      widthM: vol.width_m != null ? vol.width_m : null,
      severity,
      riskScore: riskScore != null ? Number(riskScore) : null,
      riskReasons,
      recommendedAction: cost.recommended_action || null,
      gpsAvailable: hasGps,
      gpsStatus: hasGps ? 'available' : 'unavailable',
      materialType: materialsSummary ? materialsSummary.name : null,
      materialQuantity: materialsSummary ? materialsSummary.quantity : null,
      materialCost: materialCost != null ? Number(materialCost) : null,
      labourCost: cost.labour_cost != null ? Number(cost.labour_cost) : null,
      equipmentCost: cost.equipment_cost != null ? Number(cost.equipment_cost) : null,
      totalRepairCost: totalRepairCost != null ? Number(totalRepairCost) : null,
      costCurrency: cost.currency || '₹',
      requiredMaterials,
      estimatedCost: totalRepairCost != null ? Number(totalRepairCost) : null,
      bbox: aiData.bounding_box || null,
      imagePath,
    },
  });

  return pothole;
}

/**
 * Run AI analysis on an inspection image and persist a full pothole record.
 */
async function analyzeInspection(inspectionId, imagePath, assetType) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
  });
  if (!inspection) throw new Error('Inspection not found');

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: 'PROCESSING', processingTimestamp: new Date() },
  });

  const aiData = await callAIService(imagePath, assetType);

  if (!aiData) {
    await prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        status: 'FAILED',
        errorMessage: 'AI service unavailable or returned invalid response',
      },
    });
    return { success: false, message: 'AI service unavailable' };
  }

  // Persist detection + pothole atomically
  const result = await prisma.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id: inspectionId },
      data: {
        status: 'COMPLETED',
        modelVersion: 'YOLOv8 + Open3D',
        annotatedImageUrl: aiData.annotated_image_base64 || null,
        processingTimestamp: new Date(),
      },
    });

    const pothole = await persistPothole(tx, inspection, aiData);
    return {
      potholeId: pothole.potholeId,
      defectClass: pothole.defectClass,
      severity: pothole.severity,
      riskScore: pothole.riskScore,
      imagePath: pothole.imagePath,
    };
  });

  return {
    success: true,
    message: 'Analysis completed',
    detections: 1,
    pothole: result,
  };
}

module.exports = { callAIService, analyzeInspection };
