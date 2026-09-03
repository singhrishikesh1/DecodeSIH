import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import {
  ArrowLeft,
  Camera,
  Gauge,
  MapPin,
  Radio,
  Satellite,
  Signal,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { fetchLiveState, type LiveState } from "@/lib/api";
import { formatConfidence, formatCoord, formatTimeAgo } from "@/lib/format";

const title = "Live AI View — Dronacharya pothole detection platform";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LiveView,
});

const ease = [0.16, 1, 0.3, 1] as const;

function LiveView() {
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchLiveState()
        .then((res) => {
          if (!cancelled) {
            setLive(res.data);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message);
        });

    load();
    intervalRef.current = window.setInterval(load, 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      window.clearInterval(clock);
    };
  }, []);

  const updatedAt = live?.updatedAt ?? null;
  const updatedAgo = updatedAt ? Math.max(0, Math.floor((now - updatedAt) / 1000)) : null;
  const isLive = updatedAgo != null && updatedAgo <= 10;
  const detections = live?.detections ?? [];
  const gps = live?.gps ?? null;

  const hasFrame = !!live?.frameJpegBase64;
  const backendReachable = live != null;

  let badgeLabel: string;
  let badgeDetail: string;
  if (isLive) {
    badgeLabel = "LIVE";
    badgeDetail = `${updatedAgo}s ago`;
  } else if (backendReachable) {
    badgeLabel = "WAITING";
    badgeDetail = "Pipeline running, waiting for camera stream";
  } else {
    badgeLabel = "OFFLINE";
    badgeDetail = "waiting for pipeline state";
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="pt-28 pb-16">
        <section className="mx-auto max-w-[1400px] px-5 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
          >
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm text-subtle transition-colors hover:text-foreground"
            >
              <ArrowLeft size={14} /> Back to home
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="display text-4xl md:text-[4.5rem]">
                  Live AI
                  <br />
                  <span className="text-primary">Detection View</span>
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
                  A live feed from the AI pipeline running in memory. This is streaming state only —
                  persisted potholes are shown in Defects &amp; Repairs.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                {isLive ? (
                  <>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-success" />
                    </span>
                    <span className="text-[11px] font-medium">{badgeLabel}</span>
                    <span className="text-[10px] text-subtle">{badgeDetail}</span>
                  </>
                ) : backendReachable ? (
                  <>
                    <span className="size-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-[11px] font-medium text-primary">{badgeLabel}</span>
                    <span className="text-[10px] text-subtle">{badgeDetail}</span>
                  </>
                ) : (
                  <>
                    <span className="size-2 rounded-full bg-subtle" />
                    <span className="text-[11px] font-medium text-subtle">{badgeLabel}</span>
                    <span className="text-[10px] text-subtle">{badgeDetail}</span>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {error && (
          <section className="mx-auto max-w-[1400px] px-5 pt-6 md:px-8">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <WifiOff size={13} />
              Could not connect to backend. {error}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-[1400px] px-5 md:px-8">
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* Live frame */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease }}
              className="card-panel relative overflow-hidden"
            >
              <div className="relative aspect-video bg-gradient-to-br from-[oklch(0.18_0.002_264)] to-[oklch(0.14_0.003_264)] md:aspect-[16/9]">
                {live?.frameJpegBase64 ? (
                  <img
                    src={`data:image/jpeg;base64,${live.frameJpegBase64}`}
                    alt="Live detection frame"
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/80 px-6 py-5 text-center backdrop-blur">
                      <Camera size={20} className="text-subtle" />
                      <p className="text-[11px] text-subtle">
                        {!backendReachable
                          ? "Waiting for AI pipeline state…"
                          : "Waiting for camera stream…"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute top-3 right-3 flex items-center gap-2 rounded-lg bg-card/85 px-2.5 py-1 text-[10px] text-subtle backdrop-blur">
                  <Radio size={10} className={live?.gpsLinkUp ? "text-success" : ""} />
                  {live?.gpsLinkUp
                    ? gps != null
                      ? formatCoord(gps.lat, gps.lng)
                      : "GPS linked"
                    : "GPS offline"}
                </div>

                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-card/85 px-2.5 py-1 text-[10px] text-subtle backdrop-blur">
                  <Gauge size={10} className={live?.modelLoaded ? "text-success" : ""} />
                  Model {live?.modelLoaded ? "loaded" : "not loaded"}
                  {updatedAt != null ? ` · ${formatTimeAgo(updatedAt)}` : ""}
                </div>
              </div>
            </motion.div>

            {/* Live status sidebar */}
            <div className="space-y-4">
              <div className="card-panel overflow-hidden">
                <div className="border-b border-border p-4">
                  <h3 className="text-sm font-medium">Live detections</h3>
                  <p className="text-[11px] text-subtle">in-memory state, not persisted</p>
                </div>
                <div className="space-y-2.5 p-4 max-h-72 overflow-y-auto">
                  {detections.length ? (
                    detections.map((det, i) => {
                      const label = (det.labelText ??
                        det.label ??
                        det.cls ??
                        "detection") as string;
                      const conf = typeof det.conf === "number" ? det.conf : null;
                      const bbox = Array.isArray(det.bbox) ? det.bbox : null;
                      return (
                        <div key={`det-${i}-${label}`} className="flex items-start gap-2">
                          <TriangleAlert size={12} className="mt-0.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] leading-snug">Live: {label}</p>
                            <p className="text-[10px] text-subtle">
                              {conf != null
                                ? `confidence ${formatConfidence(conf)}`
                                : "in current frame"}
                              {bbox ? ` · ${bbox.map((n) => Math.round(n)).join(",")}` : ""}
                              {det.trackId != null ? ` · track ${det.trackId}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-subtle">
                      {live == null ? "Loading live state…" : "No detections in the current frame."}
                    </p>
                  )}
                </div>
              </div>

              <div className="card-panel overflow-hidden">
                <div className="border-b border-border p-4">
                  <h3 className="text-sm font-medium">Pipeline status</h3>
                </div>
                <div className="space-y-2.5 p-4">
                  <StatusRow
                    icon={<Signal size={12} />}
                    label="AI model"
                    value={live?.modelLoaded ? "Loaded" : "Not loaded"}
                    ok={!!live?.modelLoaded}
                  />
                  <StatusRow
                    icon={<Satellite size={12} />}
                    label="GPS link"
                    value={live?.gpsLinkUp ? "Up" : "Down"}
                    ok={!!live?.gpsLinkUp}
                  />
                  <StatusRow
                    icon={<MapPin size={12} />}
                    label="Latest GPS"
                    value={gps != null ? formatCoord(gps.lat, gps.lng) : "No fix"}
                    ok={gps != null}
                  />
                  <StatusRow
                    icon={<Gauge size={12} />}
                    label="Frame age"
                    value={updatedAt != null ? `${updatedAgo}s` : "—"}
                    ok={isLive}
                  />
                  <StatusRow
                    icon={<Satellite size={12} />}
                    label="LiDAR"
                    value="Unavailable"
                    ok={false}
                  />
                  <StatusRow
                    icon={<Gauge size={12} />}
                    label="Measurement"
                    value="Uncalibrated"
                    ok={false}
                  />
                  {gps?.altitude != null && (
                    <StatusRow
                      icon={<Gauge size={12} />}
                      label="Altitude"
                      value={`${gps.altitude}m`}
                      ok
                    />
                  )}
                  {gps?.satellites != null && (
                    <StatusRow
                      icon={<Satellite size={12} />}
                      label="Satellites"
                      value={String(gps.satellites)}
                      ok
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  ok,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-subtle">{icon}</span>
      <span className="flex-1 text-[11px] text-subtle">{label}</span>
      <span
        className={`flex items-center gap-1.5 text-[11px] font-medium ${ok ? "text-success" : "text-muted-foreground"}`}
      >
        <span className={`size-1.5 rounded-full ${ok ? "bg-success" : "bg-subtle"}`} />
        {value}
      </span>
    </div>
  );
}
