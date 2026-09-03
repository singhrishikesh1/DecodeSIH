const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/dashboard — aggregated dashboard data
router.get('/', async (req, res) => {
  try {
    const [totalInspections, totalDrones, recentInspections] = await Promise.all([
      prisma.inspection.count(),
      prisma.drone.count(),
      prisma.inspection.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' },
        include: { potholes: true },
      }),
    ]);

    const [criticalCount, highCount, resolvedCount] = await Promise.all([
      prisma.inspection.count({
        where: { potholes: { some: { severity: 'CRITICAL' } } },
      }),
      prisma.inspection.count({
        where: { potholes: { some: { severity: 'HIGH' } } },
      }),
      prisma.inspection.count({ where: { status: 'RESOLVED' } }),
    ]);

    const totalBudget = await prisma.pothole.aggregate({
      _sum: { estimatedCost: true },
    });

    const activeDrones = await prisma.drone.count({
      where: { status: 'FLYING' },
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalInspections,
          criticalRisks: criticalCount,
          highRisks: highCount,
          resolvedProblems: resolvedCount,
          totalEstimatedBudget: totalBudget._sum.estimatedCost || 0,
          currency: '₹',
        },
        fleet: {
          totalDrones,
          activeDrones,
        },
        recentInspections,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
