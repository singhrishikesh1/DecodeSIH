/**
 * Rule-based severity/risk assessment for potholes and defects.
 * No ML — purely deterministic thresholds.
 */

const THRESHOLDS = {
  CRITICAL: { minScore: 85, depthCm: 15, volumeM3: 0.15 },
  HIGH:     { minScore: 65, depthCm: 10, volumeM3: 0.08 },
  MEDIUM:   { minScore: 40, depthCm: 5,  volumeM3: 0.03 },
  LOW:      { minScore: 0,  depthCm: 0,  volumeM3: 0 },
};

function assessRisk({ areaM2, depthM, volumeM3, assetType }) {
  const depthCm = depthM ? depthM * 100 : 0;
  const volume = volumeM3 || 0;
  const area = areaM2 || 0;
  const reasons = [];
  let score = 0;

  // Depth scoring
  if (depthCm > 15) {
    score += 40;
    reasons.push(`Depth ${depthCm.toFixed(1)} cm exceeds 15 cm critical threshold`);
  } else if (depthCm > 10) {
    score += 30;
    reasons.push(`Depth ${depthCm.toFixed(1)} cm exceeds 10 cm high threshold`);
  } else if (depthCm > 5) {
    score += 20;
    reasons.push(`Depth ${depthCm.toFixed(1)} cm exceeds 5 cm medium threshold`);
  } else if (depthCm > 0) {
    score += 10;
  }

  // Volume scoring
  if (volume > 0.15) {
    score += 30;
    reasons.push(`Volume ${volume.toFixed(3)} m³ exceeds critical threshold`);
  } else if (volume > 0.08) {
    score += 20;
    reasons.push(`Volume ${volume.toFixed(3)} m³ exceeds high threshold`);
  } else if (volume > 0.03) {
    score += 10;
  }

  // Area scoring
  if (area > 2.0) {
    score += 15;
    reasons.push(`Affected area ${area.toFixed(2)} m² is extensive`);
  } else if (area > 1.0) {
    score += 10;
  }

  // Asset type modifier
  if (assetType === 'bridge') {
    score += 10;
    reasons.push('Bridge infrastructure — elevated risk classification');
  } else if (assetType === 'highway') {
    score += 5;
    reasons.push('Highway — high traffic exposure');
  }

  score = Math.min(score, 100);

  let severity = 'LOW';
  if (score >= THRESHOLDS.CRITICAL.minScore) severity = 'CRITICAL';
  else if (score >= THRESHOLDS.HIGH.minScore) severity = 'HIGH';
  else if (score >= THRESHOLDS.MEDIUM.minScore) severity = 'MEDIUM';

  return { severity, riskScore: score, reasons };
}

module.exports = { assessRisk, THRESHOLDS };
