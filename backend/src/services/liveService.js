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

// Default physical-dedup tuning (mirrors ai_engine/config.yaml persistence.physical_dedup).
const DEFAULT_POSITION_TOLERANCE_M = 0.5;
const DEFAULT_BBOX_IOU_THRESHOLD = 0.7;
const DEFAULT_BBOX_WINDOW_S = 7200.0;

/** Great-circle distance between two WGS84 points in metres. */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const toRad = (d) => (d * Math.PI) / 180.0;
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Normalise a bbox (array [x1,y1,x2,y2] or object {x1,y1,x2,y2}) to [x1,y1,x2,y2] or null. */
function normalizeBbox(b) {
  if (!b) return null;
  if (Array.isArray(b) && b.length === 4) {
    const [x1, y1, x2, y2] = b.map(Number);
    return [x1, y1, x2, y2];
  }
  if (typeof b === 'object' &&
      b.x1 != null && b.y1 != null && b.x2 != null && b.y2 != null) {
    return [Number(b.x1), Number(b.y1), Number(b.x2), Number(b.y2)];
  }
  return null;
}

/** Intersection-over-union of two [x1,y1,x2,y2] boxes in image space. */
function bboxIoU(a, b) {
  if (!a || !b) return 0.0;
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0.0;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0.0;
}

/**
 * Decide whether `payload` (a confirmed pothole from the live pipeline) maps to an
 * ALREADY-persisted physical pothole in the current inspection.
 *
 * Physical identity is the backend's single source of truth: the SAME physical
 * pothole must map to ONE persistent Pxxx record, ONE evidence image and ONE DB
 * row even when the IoU tracker re-creates its transient track id, GPS flickers,
 * or the AI engine restarts mid-session (which previously produced duplicate
 * Pxxx rows/JPEGs for the same bbox/GPS).
 *
 * Returns { pothole, method, distanceM, iou } when a match exists, else null.
 * Never fabricates GPS or measurements.
 */
async function findPhysicalMatch(inspectionId, payload, dedup) {
  const tolerance = dedup.positionToleranceM ?? DEFAULT_POSITION_TOLERANCE_M;
  const iouThreshold = dedup.bboxFallbackIouThreshold ?? DEFAULT_BBOX_IOU_THRESHOLD;
  const windowS = dedup.bboxFallbackWindowS ?? DEFAULT_BBOX_WINDOW_S;

  const gps = payload.gps || {};
  const gpsValid = gps.latitude != null && gps.longitude != null;
  const bbox = payload.bbox;

  const potholes = await prisma.pothole.findMany({
    where: { inspectionId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      potholeId: true,
      imagePath: true,
      confidence: true,
      bbox: true,
      riskReasons: true,
      createdAt: true,
    },
  });
  if (!potholes.length) return null;

  // 1) GPS-anchor dedup: within tolerance of an already-persisted pothole.
  if (gpsValid) {
    let best = null;
    let bestDist = Infinity;
    for (const p of potholes) {
      const anchor = p.riskReasons && p.riskReasons.gps;
      if (!anchor || anchor.latitude == null || anchor.longitude == null) continue;
      const d = haversineM(
        gps.latitude, gps.longitude,
        anchor.latitude, anchor.longitude
      );
      if (d < bestDist) { bestDist = d; best = p; }
    }
    if (best && bestDist <= tolerance) {
      return { pothole: best, method: 'gps', distanceM: bestDist, iou: null };
    }
  }

  // 2) Image-space bbox fallback (only when GPS is unavailable for the incoming
  //    detection, and with a session-long window so restarts still associate).
  const incomingBox = normalizeBbox(bbox);
  if (incomingBox) {
    let best = null;
    let bestIou = 0.0;
    for (const p of potholes) {
      // Prefer the stale GPS record we already matched against if we have GPS.
      if (gpsValid && p.riskReasons && p.riskReasons.gps &&
          p.riskReasons.gps.latitude != null) continue;
      const rb = normalizeBbox(p.bbox);
      if (!rb) continue;
      if (!p.createdAt) continue;
      if ((Date.now() - new Date(p.createdAt).getTime()) / 1000 > windowS) continue;
      const iou = bboxIoU(incomingBox, rb);
      if (iou > bestIou) { bestIou = iou; best = p; }
    }
    if (best && bestIou >= iouThreshold) {
      return { pothole: best, method: 'bbox', distanceM: null, iou: bestIou };
    }
  }

  return null;
}

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
  const dedup = payload.physicalDedup || payload.physical_dedup || {};

  const measurement = payload.measurement || {};
  const pxl = measurement.pixel || {};

  // Physical dedup FIRST: the same physical pothole (same GPS anchor or a bbox
  // overlap within the session window) must map to ONE persistent record, ONE
  // evidence image and ONE DB row - even when the IoU tracker re-creates its
  // transient track id, GPS flickers, or the AI engine restarts mid-session.
  const match = await findPhysicalMatch(inspection.id, payload, dedup);
  if (match) {
    const { pothole: existing, method, distanceM, iou } = match;

    // Keep the strongest evidence (higher confidence) and refresh last-seen.
    const incomingConf = payload.confidence != null ? Number(payload.confidence) : null;
    const data = {};
    if (incomingConf != null &&
        (existing.confidence == null || incomingConf > existing.confidence)) {
      data.confidence = incomingConf;
    }
    // Back-fill GPS if this association supplies a fix the stored record lacked
    // (honest: only when the incoming payload actually carries valid coords).
    if (gps.latitude != null && gps.longitude != null) {
      const stored = existing.riskReasons && existing.riskReasons.gps;
      if (!stored || stored.latitude == null || stored.longitude == null) {
        data.riskReasons = {
          ...(existing.riskReasons || {}),
          gps,
        };
        data.gpsAvailable = true;
        data.gpsStatus = 'available';
      }
    }
    if (Object.keys(data).length) {
      await prisma.pothole.update({ where: { id: existing.id }, data });
    }

    console.log(
      `[liveService] ASSOCIATED ${existing.potholeId} (physical dedup via ${method}` +
      `${method === 'gps' ? `, ${distanceM.toFixed(2)} m` : `, IoU ${iou.toFixed(3)}`}) – ` +
      `no new image/record for track ${payload.trackId || '?'}`
    );
    return {
      potholeId: existing.potholeId,
      imagePath: existing.imagePath,
      inspectionId: inspection.id,
      associated: true,
      method,
      distanceM: distanceM != null ? Number(distanceM.toFixed(2)) : null,
    };
  }

  // No physical match -> this is a genuinely new confirmed pothole.
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

  return {
    potholeId,
    imagePath,
    inspectionId: inspection.id,
    associated: false,
    method: null,
    distanceM: null,
  };
}

module.exports = { persistLivePothole, findOrCreateLiveInspection, LIVE_INSPECTOR };
