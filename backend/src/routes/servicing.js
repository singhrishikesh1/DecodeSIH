const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/servicing - get fleet health overview
// Note: the service_tickets table was removed by the clean_production_schema
// migration, so service history is no longer available.
router.get('/', async (req, res) => {
  try {
    const drones = await prisma.drone.findMany({ orderBy: { createdAt: 'asc' } });

    const fleetHealthOverview = drones.map((d) => ({
      droneId: d.id,
      droneName: d.name,
      model: d.model,
      rotorHealth: d.rotorHealth,
      batteryPercent: d.batteryPercent,
      lastServiceDate: d.lastServiceDate,
      nextServiceDue: d.nextServiceDue,
      needsServiceSoon: d.nextServiceDue
        ? new Date(d.nextServiceDue) <= new Date(Date.now() + 15 * 86400000)
        : false,
    }));

    res.json({
      success: true,
      data: {
        fleetHealthOverview,
        serviceHistory: [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
