const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/potholes — all potholes/defects
router.get('/', async (req, res) => {
  try {
    const { severity, assetType } = req.query;
    const where = {};
    if (severity && severity !== 'all') where.severity = severity.toUpperCase();

    const potholes = await prisma.pothole.findMany({
      where,
      include: { inspection: true },
      orderBy: { createdAt: 'desc' },
    });

    let results = potholes;
    if (assetType && assetType !== 'all') {
      results = potholes.filter(
        (p) => p.inspection.assetType === assetType.toLowerCase()
      );
    }

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/potholes/:id
router.get('/:id', async (req, res) => {
  try {
    const pothole = await prisma.pothole.findUnique({
      where: { id: req.params.id },
      include: { inspection: true },
    });
    if (!pothole) {
      return res.status(404).json({ success: false, message: 'Pothole not found' });
    }
    res.json({ success: true, data: pothole });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/potholes/inspection/:inspectionId — potholes for a given inspection
router.get('/inspection/:inspectionId', async (req, res) => {
  try {
    const potholes = await prisma.pothole.findMany({
      where: { inspectionId: req.params.inspectionId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, count: potholes.length, data: potholes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
