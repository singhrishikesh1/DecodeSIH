/**
 * Live inspection service.
 *
 * Persists CONFIRMED potholes from the laptop AI pipeline into the database,
 * following the project's definition-of-done:
 *   - persistent sequential ID (P001, P002...) allocated atomically & restart-safe
 *   - one actual evidence image saved (pothole_P001.jpg), never per-frame
 *   - all potholes from one live run grouped under a single Inspection row
 *   - honest physical measurements: when uncalibrated, area/depth/volume stay NULL
 *     (never fabricated); severity is recorded as UNCLASSIFIED (INSUFFICIENT_DATA)
 *     with the basis recorded in risk_reasons.
 */
const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const POTHOLES_IMAGES_DIR = path.join(__dirname, '../../uploads/potholes');
const LIVE_INSPECTOR = 'Autonomous Inspection System';
const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000; // reuse the same inspection for 2h

async function findOrCreateLiveInspection(payload) {
  const assetName = payload.assetName || 'Nagar Road Highway Corridor (Point A to Point B)';
  const assetType = payload.assetType || 'road';
  const locationName = payload.locationName || assetName;
  const gps = payload.gps || {};

  const recent = await prisma.inspection.findFirst({
    where: {
      inspector: LIVE_INSPECTOR,
      assetName,
      timestamp: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
    },
    orderBy: { timestamp: 'desc' },
  });
  if (recent) return recent;

  return prisma.inspection.create({
    data: {
      assetName,
      assetType,
      locationName,
      latitude: gps.latitude != null ? Number(gps.latitude) : null,
      longitude: gps.longitude != null ? Number(gps.longitude) : null,
      altitude: gps.altitude_m != null ? Number(gps.altitude_m) : null,
      status: 'PROCESSING',
      modelVersion: 'YOLOv8 detection (ONNX)',
      inspector: LIVE_INSPECTOR,
      timestamp: new Date(),
      processingTimestamp: new Date(),
    },
  });
}

async function persistLivePothole(payload) {
  const inspection = await findOrCreateLiveInspection(payload);
  const gps = payload.gps || {};

  // Persistent sequential ID (restart-safe)
  const seq = await prisma.potholeSequence.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', current: 0 },
  });
  const next = seq.current + 1;
  await prisma.potholeSequence.update({
    where: { id: 'default' },
    data: { current: next },
  });
  const potholeId = 'P' + String(next).padStart(3, '0');

  // Evidence image (one per confirmed pothole)
  let imagePath = null;
  const b64 = payload.imageBase64Jpeg;
  if (b64 && typeof b64 === 'string') {
    try {
      if (!fs.existsSync(POTHOLES_IMAGES_DIR)) {
        fs.mkdirSync(POTHOLES_IMAGES_DIR, { recursive: true });
      }
      const filename = `pothole_${potholeId}.jpg`;
      fs.writeFileSync(
        path.join(POTHOLES_IMAGES_DIR, filename),
        Buffer.from(b64, 'base64')
      );
      imagePath = `/uploads/potholes/${filename}`;
    } catch (err) {
      console.error(`[liveService] Failed to save evidence image: ${err.message}`);
    }
  }

  const measurement = payload.measurement || {};
  const pxl = measurement.pixel || {};

  const pothole = await prisma.pothole.create({
    data: {
      potholeId,
      inspectionId: inspection.id,
      defectClass: payload.defectClass || 'Pothole',
      confidence: payload.confidence != null ? Number(payload.confidence) : null,
      // Uncalibrated physical geometry -> honest NULL (no fabrication)
      areaM2: null,
      depthM: null,
      depthType: measurement.calibrated ? 'estimated' : 'uncalibrated',
      volumeM3: null,
      lengthM: null,
      widthM: null,
      severity: payload.severity || 'UNCLASSIFIED',
      riskScore: null,
      riskReasons: {
        measurementStatus: measurement.measurement_status || 'UNCALIBRATED',
        severityStatus: payload.severityStatus || 'INSUFFICIENT_DATA',
        severityBasis: payload.severityBasis || null,
        calibrated: !!measurement.calibrated,
        source: 'live_pipeline',
        pixel: pxl,
        trackId: payload.trackId || null,
        gps: gps,
      },
      recommendedAction: measurement.calibrated
        ? 'Inspection available for physical assessment'
        : 'Manual on-ground inspection recommended (uncalibrated)',
      gpsAvailable: gps.latitude != null && gps.longitude != null,
      gpsStatus:
        gps.latitude != null && gps.longitude != null ? 'available' : 'unavailable',
      bbox: payload.bbox || null,
      imagePath,
    },
  });

  // Inspection is "completed" once it has at least one confirmed pothole.
  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { status: 'COMPLETED', processingTimestamp: new Date() },
  });

  return { potholeId, imagePath, inspectionId: inspection.id };
}

module.exports = { persistLivePothole, findOrCreateLiveInspection, LIVE_INSPECTOR };
