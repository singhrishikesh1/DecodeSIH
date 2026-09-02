const prisma = require('../config/prisma');
const { inspectionToDefect } = require('./defectService');

/**
 * Create a new inspection record with status PROCESSING.
 */
async function createInspection({ assetName, assetType, locationName, latitude, longitude, altitude, imageUrl, title, inspector, thumbnailUrl, legacyId }) {
  return prisma.inspection.create({
    data: {
      assetName,
      assetType: assetType || 'road',
      locationName: locationName || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      imageUrl: imageUrl || null,
      title: title || null,
      inspector: inspector || null,
      thumbnailUrl: thumbnailUrl || null,
      legacyId: legacyId || null,
      status: 'PROCESSING',
      timestamp: new Date(),
    },
    include: { potholes: true },
  });
}

/**
 * Create an inspection from drone upload.
 */
async function createDroneInspection({ imagePath, latitude, longitude, altitude, timestamp, droneId, missionId }) {
  // Create or link mission
  let missionIdFinal = missionId || null;
  if (droneId) {
    const mission = await prisma.mission.create({
      data: {
        droneId,
        startTime: timestamp ? new Date(timestamp) : new Date(),
        status: 'IN_PROGRESS',
      },
    });
    missionIdFinal = mission.id;
  }

  return prisma.inspection.create({
    data: {
      assetName: 'Drone Captured Inspection',
      assetType: 'road',
      imageUrl: imagePath || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      altitude: altitude ? parseFloat(altitude) : null,
      missionId: missionIdFinal,
      status: 'PROCESSING',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    },
    include: { potholes: true },
  });
}

/**
 * Persist AI detection results onto an existing inspection.
 */
async function persistAIResults(inspectionId, aiResult) {
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status: 'COMPLETED',
      modelVersion: aiResult.model_version || null,
      annotatedImageUrl: aiResult.annotated_image_url || null,
      processingTimestamp: new Date(),
    },
  });

  if (aiResult.detections && aiResult.detections.length > 0) {
    for (const det of aiResult.detections) {
      await prisma.pothole.create({
        data: {
          inspectionId,
          defectClass: det.defect_class || 'pothole',
          confidence: det.confidence || null,
          areaM2: det.area_m2 || null,
          depthM: det.depth_m || null,
          depthType: det.depth_type || 'estimated',
          volumeM3: det.volume_m3 || null,
          lengthM: det.length_m || null,
          widthM: det.width_m || null,
          bbox: det.bbox || null,
          maskUrl: det.mask_url || null,
        },
      });
    }
  }
}

/**
 * Mark inspection as failed.
 */
async function markInspectionFailed(inspectionId, errorMessage) {
  return prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status: 'FAILED',
      errorMessage: errorMessage || 'Processing failed',
    },
  });
}

module.exports = { createInspection, createDroneInspection, persistAIResults, markInspectionFailed };
