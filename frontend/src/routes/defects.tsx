import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ImageIcon,
  MapPin,
  Radio,
  Ruler,
  Search,
  TriangleAlert,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { fetchPothole, fetchPotholes, mediaUrl, type Pothole } from "@/lib/api";
import {
  formatConfidence,
  formatCoord,
  formatDate,
  formatINR,
  formatMeasurement,
  formatTimeAgo,
  gpsStatusText,
  severityStyle,
} from "@/lib/format";

const title = "Defects & Repairs — Dronacharya pothole detection platform";

export const Route = createFileRoute("/defects")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Defects,
});

const ease = [0.16, 1, 0.3, 1] as const;

const severityFilters = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "UNCLASSIFIED"] as const;
const gpsFilters = [
  { id: "ALL", label: "Any GPS" },
  { id: "available", label: "GPS available" },
  { id: "unavailable", label: "GPS unavailable" },
] as const;

function EvidenceImage({ pothole, large }: { pothole: Pothole | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = pothole ? mediaUrl(pothole.imagePath) : undefined;
  const size = large ? "aspect-video w-full" : "size-14";
  if (!src || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-subtle ${
          large ? `${size}` : size
        }`}
      >
        <ImageIcon size={large ? 28 : 16} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={pothole?.imagePath ? `Evidence image ${pothole.potholeId ?? ""}` : "Evidence image"}
      onError={() => setFailed(true)}
      loading="lazy"
      className={`shrink-0 rounded-lg border border-border object-cover ${size}`}
    />
  );
}

function PotholeDetail({ potholeId, onClose }: { potholeId: string; onClose: () => void }) {
  const [p, setP] = useState<Pothole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setP(null);
    setError(null);
    fetchPothole(potholeId)
      .then((res) => {
        if (!cancelled) setP(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [potholeId]);

  const style = severityStyle(p?.severity);
  const inspection = p?.inspection;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <EvidenceImage pothole={p} />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium">{p?.potholeId ?? "Pothole detail"}</h3>
              <p className="text-[11px] text-subtle">
                {p != null
                  ? severityLabel(p.severity) + " · " + formatTimeAgo(p.createdAt)
                  : "Loading…"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
            aria-label="Close detail"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <WifiOff size={13} />
              Could not load pothole detail. {error}
            </div>
          )}

          {!error && !p && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
              <Radio size={13} /> Loading pothole detail…
            </div>
          )}

          {p && (
            <div className="space-y-6">
              <EvidenceImage pothole={p} large />
              {p.imagePath == null && (
                <p className="text-[11px] text-subtle">
                  No evidence image recorded — the raw detection frame was not persisted.
                </p>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Severity</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${style.bg} ${style.text}`}
                >
                  <span className={`size-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Meta label="Detection ID" value={p.potholeId ?? "—"} />
                <Meta label="Confidence" value={formatConfidence(p.confidence)} />
                <Meta label="Defect class" value={p.defectClass ?? "—"} />
                <Meta label="GPS status" value={gpsStatusText(p.gpsAvailable, p.gpsStatus)} />
                <Meta
                  label="Location"
                  value={
                    inspection?.latitude != null && inspection?.longitude != null
                      ? formatCoord(inspection.latitude, inspection.longitude)
                      : p.riskReasons?.anchor
                        ? formatCoord(p.riskReasons.anchor.lat, p.riskReasons.anchor.lng)
                        : "GPS unavailable"
                  }
                />
                <Meta
                  label="Measurement status"
                  value={
                    p.depthType === "uncalibrated"
                      ? "Uncalibrated"
                      : p.areaM2 != null
                        ? "Calibrated"
                        : "Physical measurement unavailable"
                  }
                  className={p.depthType === "uncalibrated" ? "" : "text-success"}
                />
                <Meta
                  label="Est. repair cost"
                  value={p.estimatedCost != null ? formatINR(p.estimatedCost) : "No stored cost"}
                />
                <Meta
                  label="Total repair cost"
                  value={
                    p.totalRepairCost != null ? formatINR(p.totalRepairCost) : "No stored cost"
                  }
                />
                <Meta label="Recorded" value={formatDate(p.createdAt)} />
              </div>

              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Ruler size={12} /> Detected dimensions
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Area" value={formatMeasurement(p.areaM2, "m²")} />
                  <Metric label="Depth" value={formatMeasurement(p.depthM, "m")} />
                  <Metric label="Length" value={formatMeasurement(p.lengthM, "m")} />
                  <Metric label="Width" value={formatMeasurement(p.widthM, "m")} />
                </div>
                <p className="mt-2 text-[10px] text-subtle">
                  Camera-based pixel dimensions only — physical calibration or depth data is
                  required for real-world measurements.
                </p>
              </div>

              {p.bbox && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Detection box (pixels)
                  </h4>
                  <p className="text-[11px] text-subtle">
                    x {Math.round(p.bbox.x1)}–{Math.round(p.bbox.x2)} · y {Math.round(p.bbox.y1)}–
                    {Math.round(p.bbox.y2)} on the 640px source frame
                  </p>
                </div>
              )}

              {p.riskReasons?.trackIds?.length ? (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">Tracking</h4>
                  <p className="text-[11px] text-subtle">
                    Associated track IDs:{" "}
                    {(p.riskReasons.trackIds as (string | number)[]).join(", ")}
                  </p>
                </div>
              ) : null}

              {inspection && (
                <div className="rounded-lg border border-border bg-elevated p-4">
                  <h4 className="text-xs font-medium text-muted-foreground">Parent inspection</h4>
                  <p className="mt-1 text-sm font-medium">
                    {inspection.assetName ?? "Road section"}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-subtle">
                    <span className="flex items-center gap-1">
                      <MapPin size={10} /> {inspection.locationName ?? "No location"}
                    </span>
                    <span>status {inspection.status ?? "—"}</span>
                    <span>{formatTimeAgo(inspection.timestamp)}</span>
                  </p>
                </div>
              )}

              {p.recommendedAction != null && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-elevated p-4 text-[11px] text-subtle">
                  <Wrench size={13} className="mt-0.5 shrink-0 text-primary" />
                  <span>{p.recommendedAction}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Meta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
      <p className={`mt-0.5 truncate text-xs font-medium ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function severityLabel(severity: string | null | undefined): string {
  const s = severityStyle(severity);
  return severity && severity !== "UNCLASSIFIED" ? s.label : "Unclassified";
}

function Defects() {
  const [potholes, setPotholes] = useState<Pothole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<(typeof severityFilters)[number]>("ALL");
  const [gpsFilter, setGpsFilter] = useState<(typeof gpsFilters)[number]["id"]>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPotholes()
      .then((res) => {
        if (!cancelled) setPotholes(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (potholes ?? []).filter((p) => {
    if (severityFilter !== "ALL" && (p.severity ?? "").toUpperCase() !== severityFilter)
      return false;
    if (gpsFilter === "available" && !p.gpsAvailable) return false;
    if (gpsFilter === "unavailable" && p.gpsAvailable) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay =
        `${p.potholeId ?? ""} ${p.inspection?.locationName ?? ""} ${p.inspection?.assetName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const severityCount = (s: string) =>
    potholes?.filter((p) => (p.severity ?? "").toUpperCase() === s).length ?? 0;
  const gpsCount = (id: string) =>
    id === "ALL"
      ? (potholes?.length ?? 0)
      : (potholes?.filter((p) => (id === "available" ? p.gpsAvailable : !p.gpsAvailable)).length ??
        0);

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
                  Defects
                  <br />
                  <span className="text-primary">& Repairs</span>
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
                  Every pothole recorded by the detection pipeline, with its evidence image,
                  severity, GPS status, and stored repair cost.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-subtle">
                <Camera size={13} />
                {potholes == null ? "…" : `${filtered.length} of ${potholes.length} shown`}
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
          <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Search size={14} className="shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pothole ID or road section…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {severityFilters.map((s) => (
                <FilterChip
                  key={s}
                  active={severityFilter === s}
                  onClick={() => setSeverityFilter(s)}
                  label={s === "ALL" ? "All severities" : severityLabel(s)}
                  count={s === "ALL" ? potholes?.length : potholes ? severityCount(s) : undefined}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {gpsFilters.map((g) => (
                <FilterChip
                  key={g.id}
                  active={gpsFilter === g.id}
                  onClick={() => setGpsFilter(g.id)}
                  label={g.label}
                  count={gpsCount(g.id)}
                />
              ))}
            </div>
          </div>

          {potholes == null && !error && (
            <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
              <Radio size={13} /> Loading potholes…
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-xl border border-border">
            <div className="hidden md:grid md:grid-cols-[2.2fr_1fr_1fr_1.4fr_1.4fr] items-center gap-3 border-b border-border bg-elevated px-4 py-2.5 text-[10px] uppercase tracking-wide text-subtle">
              <span>Defect</span>
              <span>Severity</span>
              <span>Confidence</span>
              <span>GPS status</span>
              <span>Est. / repair cost</span>
            </div>
            {filtered.length ? (
              filtered.map((p, idx) => {
                const style = severityStyle(p.severity);
                const gps = gpsStatusText(p.gpsAvailable, p.gpsStatus);
                return (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: Math.min(idx * 0.02, 0.3), ease }}
                    onClick={() => setSelectedId(p.id)}
                    className="grid w-full grid-cols-[auto_1fr] items-center gap-3 border-b border-border bg-card p-4 text-left transition-colors last:border-b-0 hover:bg-elevated/40 md:grid-cols-[2.2fr_1fr_1fr_1.4fr_1.4fr] md:grid-cols-subgrid md:gap-3 md:px-4"
                  >
                    <div className="flex items-center gap-3">
                      <EvidenceImage pothole={p} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{p.potholeId ?? "Pothole"}</p>
                        <p className="truncate text-[10px] text-subtle">
                          {p.inspection?.locationName ?? p.inspection?.assetName ?? "Road section"}
                        </p>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
                      >
                        <span className={`size-1 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                    </div>
                    <div className="hidden md:block text-[11px] text-subtle">
                      {formatConfidence(p.confidence)}
                    </div>
                    <div className="hidden md:block text-[11px] text-subtle">{gps}</div>
                    <div className="hidden md:block text-[11px]">
                      <p>{p.estimatedCost != null ? formatINR(p.estimatedCost) : "—"}</p>
                      <p className="text-[10px] text-subtle">
                        {p.totalRepairCost != null
                          ? formatINR(p.totalRepairCost)
                          : "no stored repair cost"}
                      </p>
                    </div>
                  </motion.button>
                );
              })
            ) : (
              <div className="flex items-center gap-2 p-5 text-sm text-subtle">
                <TriangleAlert size={14} />
                {potholes == null ? "Loading potholes…" : "No potholes match the current filters."}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-1 text-[10px] text-subtle">
            <span>Evidence and costs come from the backend database —</span>
            <Link to="/defects" className="flex items-center gap-1 text-subtle">
              no manufactured values <ArrowRight size={10} />
            </Link>
          </div>
        </section>
      </main>
      <AppFooter />
      {selectedId && <PotholeDetail potholeId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number | undefined;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-subtle hover:text-foreground"
      }`}
    >
      {label}
      {count != null ? ` · ${count}` : ""}
    </button>
  );
}
