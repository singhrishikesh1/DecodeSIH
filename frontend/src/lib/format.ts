export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  if (amount >= 100000) return "₹" + (amount / 100000).toFixed(2) + " L";
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

/** 0.6125 -> "61.3%" (single-rule confidence formatting, no 0.61%). */
export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null || Number.isNaN(confidence)) return "—";
  const pct = confidence * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded}%`;
}

/** Null-safe numeric measurement in a unit. */
export function formatMeasurement(
  value: number | null | undefined,
  unit: string,
  decimals = 2,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)} ${unit}`;
}

/** Null-safe coordinate pair. */
export function formatCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  if (lat == null || lng == null) return "GPS unavailable";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

/** Display GPS status honestly. */
export function gpsStatusText(gpsAvailable: boolean, gpsStatus: string | null | undefined): string {
  if (!gpsAvailable) return "GPS unavailable";
  if (gpsStatus != null && gpsStatus !== "unavailable") return gpsStatus;
  return "GPS available";
}

export function formatTimeAgo(iso: string | number | null | undefined): string {
  if (!iso) return "—";
  const ms = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string | null | undefined;

export type SeverityStyle = {
  label: string;
  dot: string;
  text: string;
  bg: string;
};

export function severityStyle(severity: Severity): SeverityStyle {
  switch ((severity ?? "").toUpperCase()) {
    case "CRITICAL":
      return {
        label: "Critical",
        dot: "bg-destructive",
        text: "text-destructive",
        bg: "bg-destructive/15",
      };
    case "HIGH":
      return { label: "High", dot: "bg-primary", text: "text-primary", bg: "bg-primary/15" };
    case "MEDIUM":
    case "MODERATE":
      return { label: "Medium", dot: "bg-primary", text: "text-primary", bg: "bg-primary/15" };
    case "LOW":
    case "MINOR":
      return { label: "Low", dot: "bg-success", text: "text-success", bg: "bg-success/15" };
    case "SEVERE":
      return {
        label: "Severe",
        dot: "bg-destructive",
        text: "text-destructive",
        bg: "bg-destructive/15",
      };
    default:
      return {
        label: severity && severity !== "UNCLASSIFIED" ? severity : "Unclassified",
        dot: "bg-subtle",
        text: "text-subtle",
        bg: "bg-elevated",
      };
  }
}

export function droneStatusText(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "FLYING":
      return "Scanning";
    case "CHARGING":
      return "Charging";
    case "STANDBY":
      return "Standby";
    case "MAINTENANCE":
      return "Maintenance";
    case "OFFLINE":
      return "Offline";
    default:
      return status && status !== "UNCLASSIFIED" ? status : "Standby";
  }
}

// Project real GPS points into a percentage position (top/left) for the map canvas.
export function projectGPS(
  points: { lat: number | null; lng: number | null }[],
): (
  point: { lat: number | null; lng: number | null } | null,
) => { top: string; left: string } | null {
  const valid = points.filter((p) => p.lat != null && p.lng != null);
  if (!valid.length) return () => null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of valid) {
    const LAT = p.lat as number;
    const LNG = p.lng as number;
    if (LAT < minLat) minLat = LAT;
    if (LAT > maxLat) maxLat = LAT;
    if (LNG < minLng) minLng = LNG;
    if (LNG > maxLng) maxLng = LNG;
  }
  if (maxLat - minLat < 0.0001) {
    minLat -= 0.001;
    maxLat += 0.001;
  }
  if (maxLng - minLng < 0.0001) {
    minLng -= 0.001;
    maxLng += 0.001;
  }

  return (point) => {
    if (!point || point.lat == null || point.lng == null) return null;
    const pctX = ((point.lng - minLng) / (maxLng - minLng)) * 100;
    const pctY = (1 - (point.lat - minLat) / (maxLat - minLat)) * 100;
    return {
      left: `${Math.min(92, Math.max(8, pctX)).toFixed(1)}%`,
      top: `${Math.min(88, Math.max(10, pctY)).toFixed(1)}%`,
    };
  };
}
