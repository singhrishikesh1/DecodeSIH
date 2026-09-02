const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/servicing - get all service records + fleet overview
router.get('/', async (req, res) => {
  try {
    const [drones, serviceLogs] = await Promise.all([
      prisma.drone.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.serviceTicket.findMany({ orderBy: { date: 'desc' } }),
    ]);

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
        serviceHistory: serviceLogs,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/servicing/request - book a drone servicing ticket
router.post('/request', async (req, res) => {
  try {
    const { droneId, droneName, serviceType, notes } = req.body;
    if (!droneId || !serviceType) {
      return res.status(400).json({ success: false, error: 'droneId and serviceType are required' });
    }

    const newRecord = await prisma.serviceTicket.create({
      data: {
        droneId,
        droneName: droneName || 'Drone Unit',
        serviceType,
        technician: 'Assigned Senior Avionics Lead',
        notes: notes || 'Routine preventative servicing scheduled.',
        status: 'SCHEDULED',
      },
    });

    res.status(201).json({ success: true, data: newRecord });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
