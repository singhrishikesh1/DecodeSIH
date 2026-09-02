const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

/**
 * Resolve a stored image path (e.g. /uploads/potholes/pothole_P001.jpg) to an
 * absolute filesystem path, or null if it cannot be found.
 */
function resolveImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  let rel = imagePath;
  if (rel.startsWith('/uploads')) {
    rel = rel.replace(/^\/uploads/, '');
  }
  const abs = path.join(UPLOADS_DIR, rel);
  return fs.existsSync(abs) ? abs : null;
}

function fmt(value, fallback = 'N/A') {
  return value == null || value === '' ? fallback : String(value);
}

function fmtNum(value, fallback = 'N/A') {
  return value == null || Number.isNaN(Number(value)) ? fallback : Number(value);
}

function badgeColor(riskLevel) {
  switch ((riskLevel || '').toUpperCase()) {
    case 'CRITICAL':
      return '#EF4444';
    case 'HIGH':
      return '#F97316';
    case 'MEDIUM':
      return '#F59E0B';
    default:
      return '#10B981';
  }
}

class PDFService {
  /**
   * Render the header banner and return the used height.
   */
  static _header(doc, title, subtitle) {
    doc.rect(0, 0, 612, 80).fill('#0F172A');
    doc.fillColor('#F8FAFC').fontSize(18).text(title, 40, 25, { bold: true });
    doc.fontSize(9).fillColor('#94A3B8').text(subtitle, 40, 50);
    return 80;
  }

  static _footer(doc) {
    doc.fontSize(8).fillColor('#94A3B8').text(
      'Generated automatically by Drone Infrastructure Inspector Platform',
      40,
      750,
      { width: 300 }
    );
    doc.text('Authorized Signature: _______________________', 360, 750, { width: 200 });
  }

  /**
   * Embed a pothole image (actual saved file) or draw an "Image unavailable" box.
   */
  static _embedImage(doc, imagePath, y) {
    const abs = resolveImagePath(imagePath);
    if (abs) {
      try {
        doc.image(abs, 40, y, { width: 200, height: 150 });
        return y + 160;
      } catch (err) {
        console.error('[pdfService] image embed failed:', err.message);
      }
    }
    // No image available -> draw a placeholder box (never a random image).
    doc.rect(40, y, 200, 150).fillAndStroke('#E2E8F0', '#94A3B8');
    doc.fillColor('#64748B').fontSize(11).text('IMAGE UNAVAILABLE', 90, y + 68);
    return y + 160;
  }

  /**
   * Draw a single pothole detail block. Returns the next y position.
   * Handles pagination via doc.page.margins.
   */
  static _potholeBlock(doc, pothole, inspection) {
    const id = pothole.potholeId || (pothole.legacyId ? `P-${pothole.legacyId}` : 'Unavailable');

    // Section header bar
    if (doc.y > 650) doc.addPage();
    let y = doc.y + 6;
    doc.rect(40, y, 532, 22).fill('#1E293B');
    doc.fillColor('#FFFFFF').fontSize(12).text(
      `POTHOLES / DEFECT #${id}`,
      46,
      y + 5,
      { bold: true, width: 400 }
    );
    doc.fillColor(badgeColor(pothole.severity)).fontSize(10).text(
      pothole.severity || 'N/A',
      480,
      y + 6,
      { bold: true, width: 80, align: 'right' }
    );
    y += 32;

    // Image + key facts side by side
    doc.fontSize(9).fillColor('#334155');
    const facts = [
      ['Defect Class', fmt(pothole.defectClass)],
      ['Confidence', pothole.confidence != null ? `${(Number(pothole.confidence) * 100).toFixed(1)}%` : 'N/A'],
      ['GPS Status', fmt(pothole.gpsStatus || (pothole.gpsAvailable ? 'available' : 'unavailable'))],
      [
        'GPS Coordinates',
        pothole.gpsAvailable && inspection.latitude != null
          ? `${Number(inspection.latitude).toFixed(5)}° N, ${Number(inspection.longitude).toFixed(5)}° E`
          : 'Unavailable',
      ],
      ['Location', fmt(inspection.locationName, 'Unavailable')],
      ['Inspected By', fmt(inspection.inspector, 'System')],
      ['Inspection Date', inspection.timestamp ? inspection.timestamp.toLocaleDateString() : 'N/A'],
      ['Status', fmt(inspection.status, 'N/A')],
    ];

    let fx = 260;
    let fy = y;
    facts.forEach(([label, value]) => {
      if (fy > 640) {
        doc.addPage();
        fy = doc.page.margins.top + 10;
      }
      doc.fillColor('#475569').text(label.toUpperCase(), fx, fy);
      doc.fillColor('#0F172A').text(value, fx, fy + 12);
      fy += 34;
    });

    doc.fontSize(9).fillColor('#334155');
    doc.text('Pothole / Defect Image', 40, y - 2);
    const nextY = PDFService._embedImage(doc, pothole.imagePath || pothole.maskUrl, y + 10);
    const blockLeftStartY = Math.max(nextY, y + 9 * 34);

    // Volumetric / measurements
    let y2 = blockLeftStartY + 10;
    doc.fillColor('#0F172A').fontSize(11).text('Volumetric & Depth Measurements', 40, y2, { underline: true });
    y2 += 18;
    doc.fontSize(9).fillColor('#334155');
    const meas = [
      ['Volume', pothole.volumeM3 != null ? `${fmtNum(pothole.volumeM3)} m³` : 'N/A'],
      ['Surface Area', pothole.areaM2 != null ? `${fmtNum(pothole.areaM2)} m²` : 'N/A'],
      ['Avg Depth', pothole.depthM != null ? `${fmtNum((Number(pothole.depthM) * 100).toFixed(1))} cm` : 'N/A'],
      ['Max Depth', pothole.depthM != null ? `${fmtNum((Number(pothole.depthM) * 100 * 1.3).toFixed(1))} cm (est.)` : 'N/A'],
      ['Length', pothole.lengthM != null ? `${fmtNum(pothole.lengthM)} m` : 'N/A'],
      ['Width', pothole.widthM != null ? `${fmtNum(pothole.widthM)} m` : 'N/A'],
      ['Risk Score', pothole.riskScore != null ? `${fmtNum(pothole.riskScore)} / 100` : 'N/A'],
    ];
    meas.forEach(([label, value]) => {
      if (y2 > 700) {
        doc.addPage();
        y2 = doc.page.margins.top + 10;
      }
      doc.text(`${label}: ${value}`, 60, y2);
      y2 += 16;
    });

    // Cost breakdown
    y2 += 8;
    doc.fillColor('#0F172A').fontSize(11).text('Repair Cost Breakdown', 40, y2, { underline: true });
    y2 += 18;
    doc.fontSize(9).fillColor('#334155');
    const materialCost = pothole.materialCost != null ? pothole.materialCost : null;
    const labourCost = pothole.labourCost != null ? pothole.labourCost : null;
    const equipmentCost = pothole.equipmentCost != null ? pothole.equipmentCost : null;
    const totalCost = pothole.totalRepairCost != null ? pothole.totalRepairCost : pothole.estimatedCost;
    const currency = pothole.costCurrency || '₹';
    const costRows = [
      ['Material Type', pothole.materialType || 'N/A'],
      ['Material Qty', pothole.materialQuantity || 'N/A'],
      ['Material Cost', materialCost != null ? `${currency}${Number(materialCost).toLocaleString()}` : 'N/A'],
      ['Labour Cost', labourCost != null ? `${currency}${Number(labourCost).toLocaleString()}` : 'N/A'],
      ['Equipment Cost', equipmentCost != null ? `${currency}${Number(equipmentCost).toLocaleString()}` : 'N/A'],
      ['TOTAL REPAIR COST', totalCost != null ? `${currency}${Number(totalCost).toLocaleString()}` : 'N/A'],
    ];
    costRows.forEach(([label, value]) => {
      if (y2 > 700) {
        doc.addPage();
        y2 = doc.page.margins.top + 10;
      }
      doc.text(`${label}: ${value}`, 60, y2);
      y2 += 16;
    });

    // Required materials list
    if (Array.isArray(pothole.requiredMaterials) && pothole.requiredMaterials.length > 0) {
      y2 += 8;
      doc.fillColor('#0F172A').fontSize(11).text('Material BOM', 40, y2, { underline: true });
      y2 += 18;
      doc.fontSize(9).fillColor('#334155');
      pothole.requiredMaterials.forEach((m) => {
        if (y2 > 700) {
          doc.addPage();
          y2 = doc.page.margins.top + 10;
        }
        const costStr = m.cost != null ? ` — ${currency}${Number(m.cost).toLocaleString()}` : '';
        doc.text(`• ${m.name} (${m.quantity || 'N/A'})${costStr}`, 60, y2, { width: 480 });
        y2 += 16;
      });
    }

    // Risk reasons
    if (Array.isArray(pothole.riskReasons) && pothole.riskReasons.length > 0) {
      y2 += 8;
      doc.fillColor('#0F172A').fontSize(11).text('Risk Assessment', 40, y2, { underline: true });
      y2 += 18;
      doc.fontSize(9).fillColor('#334155');
      pothole.riskReasons.forEach((r) => {
        if (y2 > 700) {
          doc.addPage();
          y2 = doc.page.margins.top + 10;
        }
        doc.text(`• ${r}`, 60, y2, { width: 480 });
        y2 += 16;
      });
    }

    // Recommended action
    y2 += 8;
    doc.fillColor('#0F172A').fontSize(11).text('Recommended Engineering Action', 40, y2, { underline: true });
    y2 += 18;
    doc.fontSize(9).fillColor('#334155').text(
      pothole.recommendedAction || 'Perform field inspection and repair.',
      60,
      y2,
      { width: 480 }
    );
    y2 += 30;

    return y2;
  }

  /**
   * Generate a COMPLETE PDF report covering ALL potholes across all inspections.
   * `inspections` = array of Prisma inspections (each with potholes).
   */
  static generateFullReport(inspections, res) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Drone_Infrastructure_Full_Report_${new Date().toISOString().slice(0, 10)}.pdf`
    );
    doc.pipe(res);

    const totalPotholes = inspections.reduce((s, i) => s + (i.potholes?.length || 0), 0);
    const totalBudget = inspections.reduce(
      (s, i) =>
        s +
        (i.potholes || []).reduce((p, x) => p + (x.totalRepairCost != null ? x.totalRepairCost : x.estimatedCost || 0), 0),
      0
    );
    const critical = inspections.reduce(
      (s, i) => s + (i.potholes || []).filter((p) => p.severity === 'CRITICAL').length,
      0
    );

    // ── Title / summary page ──────────────────────────────────────────────
    PDFService._header(
      doc,
      'DRONE INFRASTRUCTURE INSPECTOR — FULL AUDIT REPORT',
      `Generated: ${new Date().toLocaleString()}  |  Classification: OFFICIAL`
    );

    doc.fillColor('#0F172A').fontSize(15).text('Executive Summary', 40, 110, { bold: true, underline: true });
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Total Infrastructure Assets Inspected: ${inspections.length}`, 40, 140);
    doc.text(`Total Potholes / Defects Detected: ${totalPotholes}`, 40, 158);
    doc.text(`Critical Risk Defects: ${critical}`, 40, 176);
    doc.text(`Total Estimated Repair Budget: ${fmtNum(totalBudget.toFixed(2))} ₹`, 40, 194);

    doc.moveTo(40, 214).lineTo(552, 214).stroke('#CBD5E1');

    doc.fontSize(11).fillColor('#0F172A').text('Index of Defects', 40, 224, { underline: true });
    let yi = 244;
    inspections.forEach((insp, idx) => {
      (insp.potholes || []).forEach((p) => {
        if (yi > 700) {
          doc.addPage();
          yi = doc.page.margins.top + 10;
        }
        const id = p.potholeId || `${insp.legacyId || insp.id}-${idx + 1}`;
        doc.fontSize(9).fillColor('#334155').text(
          `${id}  —  ${p.defectClass || 'Defect'}  (${p.severity || 'N/A'})  @ ${insp.locationName || 'Unavailable'}`,
          40,
          yi,
          { width: 500 }
        );
        yi += 16;
      });
    });

    doc.addPage();

    // ── Detailed per-pothole sections ─────────────────────────────────────
    let headerDone = false;
    inspections.forEach((insp) => {
      (insp.potholes || []).forEach((p) => {
        if (!headerDone) {
          PDFService._header(doc, 'POTHOLES / DEFECT DETAILS', 'Complete repair & inspection breakdown');
          headerDone = true;
        }
        if (doc.y > 560) doc.addPage();
        const next = PDFService._potholeBlock(doc, p, insp);
        doc.moveTo(40, next).lineTo(552, next).stroke('#CBD5E1');
        doc.y = next + 8;
      });
    });

    PDFService._footer(doc);
    doc.end();
  }

  /**
   * Backward-compatible single-defect report (used by GET /api/reports/pdf/:id).
   * Now embeds the actual pothole image and shows N/A for missing fields.
   */
  static generateInspectionReport(defect, res) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Inspection_Audit_${defect.id}.pdf`);
    doc.pipe(res);

    PDFService._header(
      doc,
      'DRONE INFRASTRUCTURE INSPECTOR AUDIT REPORT',
      `Report Ref ID: ${defect.id}  |  Date: ${String(defect.timestamp || '').slice(0, 10) || 'N/A'}  |  Classification: OFFICIAL`
    );

    // Section 1: Overview
    doc.fillColor('#0F172A').fontSize(13).text('1. Inspection Target & Geo-Location', 40, 100, { underline: true });
    doc.fontSize(10).fillColor('#334155');
    let ysv = 125;
    const overview = [
      `Asset Name: ${fmt(defect.assetName)}`,
      `Asset Type: ${defect.assetType ? String(defect.assetType).toUpperCase() : 'INFRASTRUCTURE'}`,
      `Location: ${fmt(defect.locationName, 'Unavailable')}${defect.gpsAvailable && defect.lat ? ` (${Number(defect.lat).toFixed(4)}° N, ${Number(defect.lng).toFixed(4)}° E)` : ''}`,
      `Pothole ID: ${fmt(defect.potholeId, 'N/A')}`,
      `Assigned Inspector: ${fmt(defect.inspector, 'System')}`,
    ];
    overview.forEach((line) => {
      doc.text(line, 40, ysv);
      ysv += 16;
    });

    let riskBadgeColor = badgeColor(defect.riskLevel);
    doc.rect(420, 120, 150, 60).fill(riskBadgeColor);
    doc.fillColor('#FFFFFF').fontSize(11).text('RISK LEVEL', 435, 130);
    doc.fontSize(17).text(defect.riskLevel, 435, 148, { bold: true });

    // Section 2: Volumetric metrics + image
    ysv += 10;
    doc.fillColor('#0F172A').fontSize(13).text('2. AI Defect Detection & 3D Volumetric Metrics', 40, ysv, { underline: true });
    ysv += 20;
    doc.fontSize(10).fillColor('#334155');
    doc.text(`Detected Defect: ${fmt(defect.defectClass)} (Confidence: ${defect.confidence ? (defect.confidence * 100).toFixed(1) + '%' : 'N/A'})`, 40, ysv);
    ysv += 16;
    if (defect.volumetric) {
      doc.text(`Estimated Defect Volume: ${fmtNum(defect.volumetric.volume_m3)} m³`, 40, ysv);
      ysv += 16;
      doc.text(`Affected Surface Area: ${fmtNum(defect.volumetric.surface_area_m2)} m²`, 40, ysv);
      ysv += 16;
      doc.text(`Max Depth: ${fmtNum(defect.volumetric.max_depth_cm)} cm (Avg: ${fmtNum(defect.volumetric.avg_depth_cm)} cm)`, 40, ysv);
      ysv += 16;
      doc.text(`Dimensions: ${fmtNum(defect.volumetric.length_m)}m (L) x ${fmtNum(defect.volumetric.width_m)}m (W)`, 40, ysv);
      ysv += 24;
    }

    doc.fontSize(9).fillColor('#475569').text('Pothole / Defect Image', 40, ysv);
    doc.fontSize(8).fillColor('#64748B').text(
      defect.gpsAvailable ? 'GPS: available' : 'GPS: unavailable',
      260,
      ysv
    );
    ysv = PDFService._embedImage(doc, defect.imageUrl || defect.thumbnailUrl, ysv + 12);

    // Section 3: Material BOM & cost
    ysv += 10;
    doc.fillColor('#0F172A').fontSize(13).text('3. Civil Engineering Material BOM & Repair Cost', 40, ysv, { underline: true });
    ysv += 20;

    if (defect.costBreakdown) {
      doc.fontSize(9).fillColor('#334155');
      doc.text(`Material: ${fmt(defect.costBreakdown.materialType)} (${fmt(defect.costBreakdown.materialQuantity, 'N/A qty')}) — ${defect.costBreakdown.materialCost != null ? defect.costBreakdown.currency + Number(defect.costBreakdown.materialCost).toLocaleString() : 'N/A'}`, 40, ysv);
      ysv += 14;
      doc.text(`Labour Cost: ${defect.costBreakdown.labourCost != null ? defect.costBreakdown.currency + Number(defect.costBreakdown.labourCost).toLocaleString() : 'N/A'}`, 40, ysv);
      ysv += 14;
      doc.text(`Equipment Cost: ${defect.costBreakdown.equipmentCost != null ? defect.costBreakdown.currency + Number(defect.costBreakdown.equipmentCost).toLocaleString() : 'N/A'}`, 40, ysv);
      ysv += 18;
    }

    let y = ysv;
    doc.fontSize(9).fillColor('#475569');
    doc.text('Material Description', 40, y, { bold: true });
    doc.text('Quantity Required', 260, y, { bold: true });
    doc.text('Unit Rate', 380, y, { bold: true });
    doc.text('Subtotal Cost', 480, y, { bold: true });
    doc.moveTo(40, y + 15).lineTo(560, y + 15).stroke('#CBD5E1');
    y += 25;

    if (defect.costEstimation && Array.isArray(defect.costEstimation.required_materials)) {
      defect.costEstimation.required_materials.forEach((item) => {
        if (y > 700) {
          doc.addPage();
          y = doc.page.margins.top + 10;
        }
        doc.fillColor('#1E293B');
        doc.text(fmt(item.name, 'N/A'), 40, y);
        doc.text(fmt(item.quantity), 260, y);
        doc.text(fmt(item.unit_cost), 380, y);
        doc.text(`₹${item.cost != null ? Number(item.cost).toLocaleString() : 'N/A'}`, 480, y);
        y += 20;
      });
    } else {
      doc.fillColor('#1E293B').text('No material data available', 40, y);
      y += 20;
    }

    doc.moveTo(40, y + 5).lineTo(560, y + 5).stroke('#0F172A');
    y += 15;
    const total = defect.costEstimation?.total_estimated_cost;
    doc.fontSize(12).fillColor('#0F172A').text(
      `TOTAL ESTIMATED REPAIR COST:  ${total != null ? '₹' + Number(total).toLocaleString() : '₹N/A'}`,
      40,
      y,
      { bold: true }
    );

    // Section 4: Recommended action + risk reasons
    y += 40;
    doc.fillColor('#0F172A').fontSize(13).text('4. Recommended Engineering Action', 40, y, { underline: true });
    y += 24;
    doc.fontSize(10).fillColor('#334155').text(
      defect.costEstimation?.recommended_action || 'Perform immediate field inspection and repair.',
      40,
      y,
      { width: 520 }
    );
    if (Array.isArray(defect.riskReasons) && defect.riskReasons.length > 0) {
      y += 40;
      doc.fillColor('#0F172A').fontSize(13).text('Risk Reasons', 40, y, { underline: true });
      y += 24;
      doc.fontSize(9).fillColor('#334155');
      defect.riskReasons.forEach((r) => {
        if (y > 700) {
          doc.addPage();
          y = doc.page.margins.top + 10;
        }
        doc.text(`• ${r}`, 40, y, { width: 480 });
        y += 16;
      });
    }

    PDFService._footer(doc);
    doc.end();
  }
}

module.exports = PDFService;
