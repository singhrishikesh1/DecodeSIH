const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/drones/live - list active drones & flight telemetry
router.get('/live', async (req, res) => {
  try {
    const drones = await prisma.drone.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({
      success: true,
      data: drones,
      totalActiveDrones: drones.filter((d) => d.status === 'FLYING').length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drones/:id - drone details
router.get('/:id', async (req, res) => {
  try {
    const drone = await prisma.drone.findUnique({
      where: { id: req.params.id },
    });
    if (!drone) {
      return res.status(404).json({ success: false, error: 'Drone not found' });
    }
    res.json({ success: true, data: drone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
