const express = require('express');
const router = express.Router();
const { getAllDefects, getDefectById, updateDefectStatus } = require('../services/defectService');
const { analyzeInspection } = require('../services/aiServiceV2');
const { createInspection } = require('../services/inspectionService');
const NotificationService = require('../services/notificationService');

// Get all defects with optional filter by assetType or riskLevel
router.get('/', async (req, res) => {
  try {
    const { assetType, riskLevel } = req.query;
    const defects = await getAllDefects({ assetType, riskLevel });
    res.json({ success: true, count: defects.length, data: defects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single defect detail
router.get('/:id', async (req, res) => {
  try {
    const defect = await getDefectById(req.params.id);
    if (!defect) {
      return res.status(404).json({ success: false, message: 'Defect not found' });
    }
    res.json({ success: true, data: defect });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger New Drone Inspection Analysis
router.post('/analyze', async (req, res) => {
  try {
    const { assetName, assetType, locationName, lat, lng, altitude, inspectorName } = req.body;

    const inspection = await createInspection({
      assetName: assetName || 'Metropolitan Transit Expressway',
      assetType: assetType || 'road',
      locationName: locationName || 'Sector 44, Geo-Point',
      latitude: lat,
      longitude: lng,
      altitude,
      inspector: inspectorName || 'Autonomous AirSim Drone Inspector',
    });

    // Run AI volumetric analysis (real engine) and persist a full pothole record.
    const aiResult = await analyzeInspection(inspection.id, null, assetType || 'road')
      .catch(() => ({ success: false, message: 'AI service unavailable' }));

    let defect = await getDefectById(inspection.legacyId || inspection.id);

    // If AI analysis produced a pothole, emit critical alerts per definition-of-done.
    if (defect && defect.riskLevel === 'CRITICAL') {
      NotificationService.sendCriticalSMSAlert(defect);
      NotificationService.sendEmailReport(defect);
    }

    res.json({
      success: true,
      message: aiResult.success
        ? `AI Volumetric Analysis Completed (${aiResult.pothole.potholeId})`
        : 'Inspection created; AI engine unavailable',
      data: defect,
      analysis: aiResult,
    });
  } catch (err) {
    console.error('[Defects:analyze] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update defect status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }
    const updated = await updateDefectStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Defect not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
