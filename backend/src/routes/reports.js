const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { getDefectById } = require('../services/defectService');
const PDFService = require('../services/pdfService');
const NotificationService = require('../services/notificationService');

// Download COMPLETE PDF Audit Report — all potholes across all inspections
router.get('/full', async (req, res) => {
  try {
    const inspections = await prisma.inspection.findMany({
      include: { potholes: true },
      orderBy: { timestamp: 'desc' },
    });
    if (!inspections.length) {
      return res.status(404).json({ success: false, message: 'No inspection data available' });
    }
    PDFService.generateFullReport(inspections, res);
  } catch (err) {
    console.error('[Reports:full] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download PDF Audit Report (single defect)
router.get('/pdf/:id', async (req, res) => {
  try {
    const defect = await getDefectById(req.params.id);
    if (!defect) {
      return res.status(404).json({ success: false, message: 'Defect report not found' });
    }
    PDFService.generateInspectionReport(defect, res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger SMS Alert
router.post('/sms-alert/:id', async (req, res) => {
  try {
    const defect = await getDefectById(req.params.id);
    if (!defect) {
      return res.status(404).json({ success: false, message: 'Defect not found' });
    }
    const result = await NotificationService.sendCriticalSMSAlert(defect);
    res.json({ success: true, message: 'SMS Alert Dispatched via Twilio API', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger Email Audit Report
router.post('/email-report/:id', async (req, res) => {
  try {
    const defect = await getDefectById(req.params.id);
    if (!defect) {
      return res.status(404).json({ success: false, message: 'Defect not found' });
    }
    const { email } = req.body;
    const result = await NotificationService.sendEmailReport(defect, email);
    res.json({ success: true, message: 'Email Audit Report Dispatched via Nodemailer', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
