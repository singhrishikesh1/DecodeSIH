const express = require('express');
const router = express.Router();
const redisStore = require('../services/redisStore');

// GET /api/redis/stats - get real-time Redis performance & telemetry stats
router.get('/stats', (req, res) => {
  try {
    const stats = redisStore.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
