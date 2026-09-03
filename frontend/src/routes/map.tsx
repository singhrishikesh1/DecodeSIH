import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import { ArrowLeft, Compass, MapPin, Maximize, Minus, Plus, Radio, WifiOff } from "lucide-react";
import { fetchDrones, fetchPotholes, type Drone, type Pothole } from "@/lib/api";
import { formatCoord, projectGPS, severityStyle } from "@/lib/format";

const title = "Map — RX pothole detection platform";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MapPage,
});

const ease = [0.16, 1, 0.3, 1] as const;

function DroneGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="text-foreground">
      <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="26" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="26" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="26" cy="26" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9 L23 23 M23 9 L9 23" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="12" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

function MapPage() {
  const [drones, setDrones] = useState<Drone[] | null>(null);
  const [potholes, setPotholes] = useState<Pothole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchDrones(), fetchPotholes()]).then((results) => {
      if (cancelled) return;
      const [dr, poth] = results;
      if (dr.status === "fulfilled") setDrones(dr.value.data);
      if (poth.status === "fulfilled") setPotholes(poth.value.data);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        setError(
          failed
            .map((f) => (f.status === "rejected" ? (f.reason as Error).message : ""))
            .join("; "),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drones with a valid GPS fix.
  const positionedDrones = useMemo(
    () => (drones ?? []).filter((d) => d.lat != null && d.lng != null),
    [drones],
  );

  // Potholes with a real GPS fix (from their parent inspection or risk anchor).
  const positionedPotholes = useMemo(
    () =>
      (potholes ?? []).filter((p) => {
        const insLat = p.inspection?.latitude;
        const insLng = p.inspection?.longitude;
        const anchor = p.riskReasons?.anchor;
        return (
          (insLat != null && insLng != null) ||
          (anchor != null && anchor.lat != null && anchor.lng != null)
        );
      }),
    [potholes],
  );

  const noGpsCount = (potholes ?? []).length - positionedPotholes.length;

  const project = useMemo(
    () =>
      projectGPS([
        ...positionedDrones.map((d) => ({ lat: d.lat, lng: d.lng })),
        ...positionedPotholes.map((p) => {
          const insLat = p.inspection?.latitude;
          const insLng = p.inspection?.longitude;
          const anchor = p.riskReasons?.anchor;
          return { lat: insLat ?? anchor?.lat ?? null, lng: insLng ?? anchor?.lng ?? null };
        }),
      ]),
    [positionedDrones, positionedPotholes],
  );

  const hasMapData = positionedDrones.length > 0 || positionedPotholes.length > 0;

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
                  Survey
                  <br />
                  <span className="text-primary">Map</span>
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
                  Real drone positions and pothole locations using true GPS coordinates from the
                  backend. Markers only appear where a GPS fix exists.
                </p>
              </div>
              <div className="text-right text-[11px] text-subtle">
                {drones == null || potholes == null ? (
                  <p className="text-sm font-medium text-foreground">Loading…</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {positionedDrones.length} drones · {positionedPotholes.length} potholes on map
                    </p>
                    <p>{noGpsCount} potholes without GPS (not placed)</p>
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
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Map canvas */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease }}
              className="card-panel relative overflow-hidden"
            >
              <div className="relative h-[420px] bg-gradient-to-br from-[oklch(0.18_0.002_264)] to-[oklch(0.14_0.003_264)] md:h-[560px]">
                <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />

                {/* Drone markers */}
                {positionedDrones.map((d, i) => {
                  const pos = project({ lat: d.lat, lng: d.lng });
                  if (!pos) return null;
                  const isSelected = selectedKey === `drone:${d.id}`;
                  return (
                    <motion.button
                      key={`drone:${d.id}`}
                      style={{ top: pos.top, left: pos.left }}
                      className={`absolute z-10 -translate-x-1/2 cursor-pointer`}
                      onClick={() => setSelectedKey(isSelected ? null : `drone:${d.id}`)}
                    >
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.4,
                        }}
                      >
                        <span
                          className={`flex size-8 items-center justify-center rounded-full border-2 ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-foreground"
                          }`}
                        >
                          <Radio size={14} />
                        </span>
                      </motion.div>
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-foreground">
                        {d.name}
                      </span>
                    </motion.button>
                  );
                })}

                {/* Pothole markers */}
                {positionedPotholes.map((p) => {
                  const insLat = p.inspection?.latitude;
                  const insLng = p.inspection?.longitude;
                  const anchor = p.riskReasons?.anchor;
                  const pos = project({
                    lat: insLat ?? anchor?.lat ?? null,
                    lng: insLng ?? anchor?.lng ?? null,
                  });
                  if (!pos) return null;
                  const style = severityStyle(p.severity);
                  const isSelected = selectedKey === `pothole:${p.id}`;
                  return (
                    <motion.button
                      key={`pothole:${p.id}`}
                      style={{ top: pos.top, left: pos.left }}
                      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      onClick={() => setSelectedKey(isSelected ? null : `pothole:${p.id}`)}
                    >
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${isSelected ? "ring-2 ring-primary" : ""} ${style.bg} ${style.text}`}
                      >
                        <MapPin size={9} />
                        {p.potholeId ?? "pothole"}
                        <span className="opacity-70">{style.label}</span>
                      </span>
                    </motion.button>
                  );
                })}

                {!hasMapData && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/80 px-4 py-3 text-[11px] text-subtle backdrop-blur">
                      <WifiOff size={14} />
                      <span>No GPS fixes yet — markers appear when drones report positions.</span>
                    </div>
                  </div>
                )}

                {/* Map controls */}
                <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
                  {[Plus, Minus, Maximize, Compass].map((Icon, i) => (
                    <button
                      key={i}
                      className={`flex size-7 items-center justify-center rounded-lg border border-border transition-colors ${
                        i === 3
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-subtle hover:text-foreground"
                      }`}
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[10px] text-subtle">
                <span>Scale is relative — projection spans the live GPS bounding box.</span>
                <span>Markers = real GPS, drones pulsing</span>
              </div>
            </motion.div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="card-panel p-4">
                <h3 className="text-xs font-medium">Survey Drones</h3>
                <div className="mt-3 space-y-2">
                  {positionedDrones.length ? (
                    positionedDrones.map((d) => (
                      <div key={d.id} className="flex items-start gap-2">
                        <DroneGlyph size={16} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium">{d.name}</p>
                          <p className="text-[10px] text-subtle">
                            {d.lat != null && d.lng != null
                              ? formatCoord(d.lat, d.lng)
                              : "GPS unavailable"}
                          </p>
                        </div>
                        <span className="text-[10px] text-subtle">{d.status ?? "—"}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-subtle">
                      {drones == null ? "Loading drones…" : "No drones with a GPS fix"}
                    </p>
                  )}
                </div>
              </div>

              <div className="card-panel p-4">
                <h3 className="text-xs font-medium">Potholes with GPS</h3>
                <div className="mt-3 space-y-2">
                  {positionedPotholes.length ? (
                    positionedPotholes.slice(0, 12).map((p) => {
                      const style = severityStyle(p.severity);
                      const insLat = p.inspection?.latitude;
                      const insLng = p.inspection?.longitude;
                      const anchor = p.riskReasons?.anchor;
                      return (
                        <div key={p.id} className="flex items-start gap-2">
                          <span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${style.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium">
                              {p.potholeId ?? "Pothole"} ·{" "}
                              <span className={style.text}>{style.label}</span>
                            </p>
                            <p className="text-[10px] text-subtle">
                              {insLat != null && insLng != null
                                ? formatCoord(insLat, insLng)
                                : anchor
                                  ? formatCoord(anchor.lat, anchor.lng)
                                  : "GPS unavailable"}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-subtle">
                      {potholes == null ? "Loading potholes…" : "No potholes have a GPS fix yet."}
                    </p>
                  )}
                </div>
                {noGpsCount > 0 && (
                  <p className="mt-3 border-t border-border pt-2 text-[10px] text-subtle">
                    {noGpsCount} more pothole{noGpsCount === 1 ? "" : "s"} recorded without GPS —
                    viewable in Defects &amp; Repairs.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
