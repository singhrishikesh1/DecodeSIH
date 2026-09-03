import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, LocateFixed, Loader2 } from "lucide-react";

/**
 * Overview / Dashboard device-location map.
 *
 * Displays ONLY the CURRENT BROWSER DEVICE location obtained via
 * navigator.geolocation. It deliberately does NOT use drone/flight-controller
 * GPS, MAVLink, backend live-state GPS, or any hardcoded/fake coordinates.
 * It works independently of the backend: if geolocation is unavailable the
 * OpenStreetMap base layer still renders with a status message.
 *
 * The Latitude/Longitude on this map are the browser's coordinates only.
 */

const INITIAL_VIEW: L.LatLngExpression = [20, 0];
const INITIAL_ZOOM = 2;

type GeoStatus = "getting" | "ok" | "denied" | "unavailable" | "unsupported";

type DevicePosition = {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
};

function isValidPosition(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function statusLabel(status: GeoStatus): string {
  switch (status) {
    case "getting":
      return "Getting current location...";
    case "denied":
      return "Location permission denied";
    case "unavailable":
      return "Location unavailable";
    case "unsupported":
      return "Geolocation is not supported by this browser.";
    case "ok":
      return "Current Device Location";
  }
}

const deviceIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:28px;height:28px;">
      <div style="position:absolute;inset:0;margin:auto;width:28px;height:28px;border-radius:9999px;background:rgba(34,197,94,0.25);border:1px solid rgba(34,197,94,0.5);"></div>
      <div style="position:absolute;inset:0;margin:auto;width:12px;height:12px;border-radius:9999px;background:#22c55e;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

function FollowController({
  position,
  follow,
  onUserDrag,
}: {
  position: DevicePosition | null;
  follow: boolean;
  onUserDrag: () => void;
}) {
  const map = useMap();
  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    if (!position) return;
    if (followRef.current) {
      map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15), {
        animate: true,
      });
    }
  }, [position, map]);

  useEffect(() => {
    const handleDragStart = () => {
      if (followRef.current) onUserDrag();
    };
    map.on("dragstart", handleDragStart);
    return () => {
      map.off("dragstart", handleDragStart);
    };
  }, [map, onUserDrag]);

  return null;
}

type TelemetryRow = { label: string; value: string | number };

function formatDegrees(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(6)}° ${ns}, ${Math.abs(lng).toFixed(6)}° ${ew}`;
}

export function DeviceLocationMap() {
  const [status, setStatus] = useState<GeoStatus>("getting");
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const [follow, setFollow] = useState(true);
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    const onSuccess = (pos: GeolocationPosition) => {
      const c = pos.coords;
      if (!isValidPosition(c.latitude, c.longitude)) return;
      const next: DevicePosition = {
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy,
        altitude: Number.isFinite(c.altitude) ? c.altitude : null,
        speed: Number.isFinite(c.speed) ? c.speed : null,
        heading: Number.isFinite(c.heading) ? c.heading : null,
      };
      setPosition(next);
      setStatus("ok");

      const rows: TelemetryRow[] = [
        { label: "Latitude", value: c.latitude.toFixed(6) },
        { label: "Longitude", value: c.longitude.toFixed(6) },
        { label: "Accuracy", value: `${Math.round(c.accuracy)} m` },
      ];
      if (next.altitude != null)
        rows.push({ label: "Altitude", value: `${c.altitude?.toFixed(1)} m` });
      if (next.speed != null)
        rows.push({ label: "Speed", value: `${c.speed?.toFixed(1)} m/s` });
      if (next.heading != null)
        rows.push({ label: "Heading", value: `${c.heading?.toFixed(0)}°` });
      setTelemetry(rows);
    };

    const onError = (err: GeolocationPositionError) => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setStatus("denied");
          break;
        case err.POSITION_UNAVAILABLE:
        case err.TIMEOUT:
        default:
          setStatus("unavailable");
          break;
      }
    };

    watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    });

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  const posLatLng: L.LatLngExpression | null = position
    ? [position.lat, position.lng]
    : null;

  return (
    <div className="relative h-[300px] w-full overflow-hidden md:h-[430px]">
      <MapContainer
        center={INITIAL_VIEW}
        zoom={INITIAL_ZOOM}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {posLatLng && position && (
          <>
            <Circle
              center={posLatLng}
              radius={position.accuracy}
              pathOptions={{
                color: "#22c55e",
                weight: 1,
                fillColor: "#22c55e",
                fillOpacity: 0.12,
              }}
            />
            <Marker position={posLatLng} icon={deviceIcon}>
              <Popup>
                <strong>Current Device Location</strong>
              </Popup>
            </Marker>
          </>
        )}

        <FollowController
          position={position}
          follow={follow}
          onUserDrag={() => setFollow(false)}
        />
      </MapContainer>

      {/* status overlay */}
      {status !== "ok" && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/55 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-4 py-2.5 text-[11px] text-foreground shadow-lg">
            {status === "getting" ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : (
              <span className="size-2 rounded-full bg-subtle" />
            )}
            {statusLabel(status)}
          </div>
        </div>
      )}

      {/* telemetry card */}
      {position && (
        <div className="absolute top-3 left-3 z-[500] rounded-xl border border-border bg-card/90 px-3 py-2.5 text-[10px] shadow-lg backdrop-blur">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <LocateFixed size={11} className="text-success" />
            Current Device Location
          </p>
          <p className="text-subtle">{formatDegrees(position.lat, position.lng)}</p>
          <p className="mt-0.5 text-subtle">Accuracy ±{Math.round(position.accuracy)} m</p>
          <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
            {telemetry
              .filter((r) => r.label !== "Latitude" && r.label !== "Longitude" && r.label !== "Accuracy")
              .map((r) => (
                <p key={r.label} className="text-subtle">
                  {r.label}: <span className="text-foreground">{r.value}</span>
                </p>
              ))}
          </div>
        </div>
      )}

      {/* follow control */}
      <button
        type="button"
        onClick={() => setFollow((v) => !v)}
        disabled={!position}
        className={`absolute right-3 bottom-3 z-[500] flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          follow
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card/90 text-foreground hover:bg-elevated"
        }`}
        title="Follow Location"
      >
        <Navigation size={12} />
        Follow Location
      </button>
    </div>
  );
}
