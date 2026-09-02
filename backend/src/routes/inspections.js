const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const prisma = require('../config/prisma');
const { createInspection, createDroneInspection, persistAIResults, markInspectionFailed } = require('../services/inspectionService');
const { analyzeInspection } = require('../services/aiServiceV2');

const upload = multer({
  dest: path.join(__dirname, '../../uploads/'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|tiff/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    cb(null, extOk && mimeOk);
  },
});

// GET /api/inspections — list all inspections
router.get('/', async (req, res) => {
  try {
    const { status, assetType, severity } = req.query;
    const where = {};
    if (status) where.status = status.toUpperCase();
    if (assetType && assetType !== 'all') where.assetType = assetType.toLowerCase();

    const inspections = await prisma.inspection.findMany({
      where,
      include: { potholes: true },
      orderBy: { timestamp: 'desc' },
    });

    let results = inspections;
    if (severity && severity !== 'all') {
      results = inspections.filter((i) =>
        i.potholes.some((p) => p.severity === severity.toUpperCase())
      );
    }

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/inspections/:id — single inspection detail
router.get('/:id', async (req, res) => {
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: req.params.id },
      include: { potholes: true, mission: true },
    });
    if (!inspection) {
      return res.status(404).json({ success: false, message: 'Inspection not found' });
    }
    res.json({ success: true, data: inspection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/inspections — create new inspection
router.post('/', async (req, res) => {
  try {
    const inspection = await createInspection(req.body);
    res.status(201).json({ success: true, data: inspection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/inspections/upload — image upload + AI analysis
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { assetName, assetType, locationName, latitude, longitude, altitude, inspector } = req.body;
    const imagePath = req.file ? req.file.path : null;

    const inspection = await createInspection({
      assetName: assetName || 'Uploaded Inspection',
      assetType: assetType || 'road',
      locationName,
      latitude,
      longitude,
      altitude,
      imageUrl: imagePath,
      inspector,
    });

    // Attempt AI analysis
    if (imagePath) {
      const aiResult = await analyzeInspection(inspection.id, imagePath, assetType);
      if (aiResult.success) {
        const updated = await prisma.inspection.findUnique({
          where: { id: inspection.id },
          include: { potholes: true },
        });
        return res.json({ success: true, message: 'Inspection created and analyzed', data: updated });
      }
    }

    const pending = await prisma.inspection.findUnique({
      where: { id: inspection.id },
      include: { potholes: true },
    });
    res.status(201).json({ success: true, message: 'Inspection created, pending analysis', data: pending });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/inspections/drone-upload — drone ingestion with coordinates
router.post('/drone-upload', upload.single('image'), async (req, res) => {
  try {
    const { latitude, longitude, altitude, timestamp, droneId } = req.body;
    const imagePath = req.file ? req.file.path : null;

    const inspection = await createDroneInspection({
      imagePath,
      latitude,
      longitude,
      altitude,
      timestamp,
      droneId,
    });

    // Attempt AI analysis
    if (imagePath) {
      const aiResult = await analyzeInspection(inspection.id, imagePath, 'road');
      if (aiResult.success) {
        const updated = await prisma.inspection.findUnique({
          where: { id: inspection.id },
          include: { potholes: true },
        });
        return res.json({ success: true, message: 'Drone inspection processed', data: updated });
      }
    }

    const pending = await prisma.inspection.findUnique({
      where: { id: inspection.id },
      include: { potholes: true },
    });
    res.status(201).json({ success: true, message: 'Drone inspection queued', data: pending });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/inspections/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }
    const updated = await prisma.inspection.update({
      where: { id: req.params.id },
      data: { status: status.toUpperCase() },
      include: { potholes: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
