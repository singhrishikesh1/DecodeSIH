const express = require('express');
const router = express.Router();
const { getAnalyticsSummary } = require('../services/defectService');

router.get('/', async (req, res) => {
  try {
    const summary = await getAnalyticsSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
