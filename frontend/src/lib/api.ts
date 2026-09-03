const env = import.meta.env as Record<string, string | undefined>;
export const API_BASE = env["VITE_API_BASE"] ?? "http://localhost:5002";

export type DashboardSummary = {
  totalInspections: number;
  criticalRisks: number;
  highRisks: number;
  resolvedProblems: number;
  totalEstimatedBudget: number;
  currency: string;
};

export type DashboardFleet = {
  totalDrones: number;
  activeDrones: number;
  totalServiceTickets: number;
};

export type PotholeRiskReasons = {
  gps?: unknown;
  pixel?: {
    area_px?: number;
    width_px?: number;
    height_px?: number;
    aspect_ratio?: number;
  } | null;
  anchor?: { lat: number; lng: number } | null;
  source?: string;
  trackId?: string | number | null;
  trackIds?: (string | number)[];
  latestGps?: { lat: number; lng: number } | null;
  calibrated?: boolean;
  lastSeenAt?: string | null;
  severityBasis?: string | null;
  severityStatus?: string | null;
  measurementStatus?: string | null;
};

export type Pothole = {
  id: string;
  potholeId: string | null;
  inspectionId: string;
  defectClass: string;
  confidence: number | null;
  areaM2: number | null;
  depthM: number | null;
  depthType: string | null;
  volumeM3: number | null;
  lengthM: number | null;
  widthM: number | null;
  severity: string | null;
  riskScore: number | null;
  riskReasons?: PotholeRiskReasons | null;
  bbox?: { x1: number; x2: number; y1: number; y2: number } | null;
  recommendedAction?: string | null;
  maskUrl?: string | null;
  gpsAvailable: boolean;
  gpsStatus: string | null;
  materialType: string | null;
  materialQuantity: number | null;
  materialCost: number | null;
  labourCost: number | null;
  equipmentCost: number | null;
  totalRepairCost: number | null;
  costCurrency: string | null;
  requiredMaterials: unknown;
  imagePath: string | null;
  estimatedCost: number | null;
  createdAt: string;
  updatedAt?: string;
  inspection?: Inspection | null;
};

export type Inspection = {
  id: string;
  legacyId: string | null;
  missionId: string | null;
  assetName: string;
  assetType: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  imageUrl: string | null;
  annotatedImageUrl: string | null;
  status: string;
  errorMessage: string | null;
  timestamp: string;
  title: string | null;
  inspector: string | null;
  alertSent: boolean;
  thumbnailUrl: string | null;
  modelVersion: string | null;
  potholes?: Pothole[] | null;
};

export type Drone = {
  id: string;
  name: string;
  model: string;
  status: string;
  assignedArea: string | null;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  speedKmH: number | null;
  batteryPercent: number | null;
  rotorHealth: number | null;
  cameraStream: string | null;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  totalFlightHours: number | null;
  updatedAt: string;
};

export type LiveDetection = {
  trackId?: number | string;
  conf?: number;
  cls?: string;
  label?: string;
  bbox?: number[];
  labelText?: string;
  detections?: unknown[];
};

export type LiveState = {
  frameJpegBase64?: string | null;
  detections: {
    trackId?: number | string;
    conf?: number;
    cls?: string;
    label?: string;
    bbox?: number[];
    labelText?: string;
    detections?: unknown[];
  }[];
  gps: {
    lat: number;
    lng: number;
    altitude?: number | null;
    fix?: number | null;
    satellites?: number | null;
    speed?: number | null;
  } | null;
  modelLoaded: boolean;
  gpsLinkUp: boolean;
  timestamp: number | null | undefined;
  updatedAt: number | null | undefined;
};

export type DashboardData = {
  summary: DashboardSummary;
  fleet: DashboardFleet;
  recentInspections: Inspection[];
};

export type ApiError = {
  success: false;
  error?: string;
  message?: string;
};

export async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      let message = `Request failed (${res.status})`;
      try {
        const body = JSON.parse(text) as ApiError;
        message = body.error ?? body.message ?? message;
      } catch {
        // keep generic message
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchDashboard() {
  return fetchJson<{ success: true; data: DashboardData }>("/api/dashboard");
}

export function fetchDrones() {
  return fetchJson<{ success: true; data: Drone[]; totalActiveDrones: number }>("/api/drones/live");
}

export function fetchPotholes() {
  return fetchJson<{ success: true; count: number; data: Pothole[] }>("/api/potholes");
}

export function fetchPothole(id: string) {
  return fetchJson<{ success: true; data: Pothole }>(`/api/potholes/${encodeURIComponent(id)}`);
}

export function fetchInspections() {
  return fetchJson<{ success: true; count: number; data: Inspection[] }>("/api/inspections");
}

export function fetchInspection(id: string) {
  return fetchJson<{ success: true; data: Inspection }>(
    `/api/inspections/${encodeURIComponent(id)}`,
  );
}

export function fetchLiveState() {
  return fetchJson<{ success: true; data: RawLiveState }>("/api/live/state").then((res) => ({
    success: true as const,
    data: normalizeLiveState(res.data),
  }));
}

type RawLiveState = {
  frameJpegBase64: string | null;
  detections: LiveState["detections"];
  gps: {
    latitude?: number;
    longitude?: number;
    altitude_m?: number | null;
    fix_type?: number;
    satellites_visible?: number | null;
    eph?: number | null;
    source?: string;
    timestamp?: number;
    lat?: number;
    lng?: number;
    altitude?: number | null;
    fix?: number;
    satellites?: number;
    speed?: number | null;
  } | null;
  modelLoaded: boolean;
  gpsLinkUp: boolean;
  timestamp: number | null;
  updatedAt: number | null;
  gpsFixAge?: boolean;
};

function normalizeLiveState(raw: RawLiveState): LiveState {
  let normalizedGps: LiveState["gps"] = null;
  const rawGps = raw.gps;
  if (rawGps && typeof rawGps === "object") {
    const lat = rawGps.latitude ?? rawGps.lat;
    const lng = rawGps.longitude ?? rawGps.lng;
    if (lat != null && lng != null) {
      normalizedGps = {
        lat,
        lng,
        altitude: rawGps.altitude_m ?? rawGps.altitude ?? null,
        fix: rawGps.fix_type ?? rawGps.fix ?? null,
        satellites: rawGps.satellites_visible ?? rawGps.satellites ?? null,
        speed: rawGps.speed ?? null,
      };
    }
  }
  return {
    frameJpegBase64: raw.frameJpegBase64 ?? null,
    detections: raw.detections ?? [],
    gps: normalizedGps,
    modelLoaded: !!raw.modelLoaded,
    gpsLinkUp: !!raw.gpsLinkUp,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : null,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
  };
}

export const MEDIA_BASE = API_BASE;

export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}
