const express = require('express');
const router = express.Router();
const { persistLivePothole } = require('../services/liveService');
const liveStore = require('../services/liveStore');

// POST /api/live/potholes — persist one confirmed pothole from the AI pipeline.
router.post('/potholes', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Empty payload' });
    }
    const result = await persistLivePothole(payload);
    res.status(201).json({ success: true, pothole: result });
  } catch (err) {
    console.error('[live] failed to persist pothole:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live/state — laptop pushes latest live-view snapshot (frame+detections).
router.post('/state', (req, res) => {
  try {
    liveStore.push(req.body || {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/live/state — frontend polls latest live-view snapshot.
router.get('/state', (req, res) => {
  try {
    res.json({ success: true, data: liveStore.get() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
