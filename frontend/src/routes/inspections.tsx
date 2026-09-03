import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ImageIcon,
  MapPin,
  Radio,
  Search,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import {
  fetchInspection,
  fetchInspections,
  mediaUrl,
  type Inspection,
  type Pothole,
} from "@/lib/api";
import { formatConfidence, formatDate, formatTimeAgo, severityStyle } from "@/lib/format";

const title = "Inspections — Dronacharya pothole detection platform";

export const Route = createFileRoute("/inspections")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Inspections,
});

const ease = [0.16, 1, 0.3, 1] as const;

const statusColors: Record<string, string> = {
  COMPLETED: "text-success",
  PROCESSING: "text-primary",
  IN_PROGRESS: "text-primary",
  RESOLVED: "text-success",
  DISPATCHED: "text-primary",
  IN_REVIEW: "text-primary",
  FAILED: "text-destructive",
  ERROR: "text-destructive",
};

function statusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED":
      return "Completed";
    case "PROCESSING":
      return "Processing";
    case "IN_PROGRESS":
      return "In progress";
    case "RESOLVED":
      return "Resolved";
    case "DISPATCHED":
      return "Dispatched";
    case "IN_REVIEW":
      return "In review";
    case "FAILED":
    case "ERROR":
      return "Failed";
    default:
      return status ?? "—";
  }
}

function EvidenceThumb({ pothole, className }: { pothole: Pothole; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(pothole.imagePath);
  if (!src || failed) {
    return (
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-subtle ${className ?? ""}`}
      >
        <ImageIcon size={16} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Evidence image for ${pothole.potholeId ?? "pothole"}`}
      onError={() => setFailed(true)}
      className={`size-12 shrink-0 rounded-lg border border-border object-cover ${className ?? ""}`}
      loading="lazy"
    />
  );
}

function InspectionDetail({
  inspectionId,
  onClose,
}: {
  inspectionId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchInspection(inspectionId)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  const potholes = detail?.potholes ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">
              {detail?.assetName ?? "Loading inspection…"}
            </h3>
            <p className="text-[11px] text-subtle">
              {detail ? formatTimeAgo(detail.timestamp) : "Fetching detail…"}
            </p>
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
              Could not load inspection detail. {error}
            </div>
          )}

          {!error && !detail && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
              <Radio size={13} />
              Loading inspection detail…
            </div>
          )}

          {detail && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Meta
                  label="Status"
                  value={statusLabel(detail.status)}
                  className={statusColors[detail.status?.toUpperCase() ?? ""] ?? ""}
                />
                <Meta label="Asset type" value={detail.assetType ?? "—"} />
                <Meta label="Location" value={detail.locationName ?? "—"} />
                <Meta label="Inspector" value={detail.inspector ?? "—"} />
                <Meta label="Model" value={detail.modelVersion ?? "—"} />
                <Meta label="Timestamp" value={formatDate(detail.timestamp)} />
              </div>

              {detail.latitude != null && detail.longitude != null && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
                  <MapPin size={13} />
                  GPS: {detail.latitude.toFixed(6)}° N, {detail.longitude.toFixed(6)}° E
                  {detail.altitude != null ? ` · altitude ${detail.altitude}m` : ""}
                </div>
              )}

              <div>
                <h4 className="text-xs font-medium text-muted-foreground">
                  Detected Potholes ({potholes.length})
                </h4>
                <div className="mt-3 space-y-2.5">
                  {potholes.length ? (
                    potholes.map((p) => {
                      const style = severityStyle(p.severity);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                        >
                          <EvidenceThumb pothole={p} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">
                              {p.potholeId ?? "Pothole"} ·{" "}
                              <span className={style.text}>{style.label}</span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-subtle">
                              <span>conf {formatConfidence(p.confidence)}</span>
                              <span>
                                GPS {p.gpsAvailable ? (p.gpsStatus ?? "available") : "unavailable"}
                              </span>
                              <span>created {formatTimeAgo(p.createdAt)}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-subtle">
                      No potholes recorded for this inspection.
                    </p>
                  )}
                </div>
              </div>

              <Link
                to="/inspections"
                className="inline-flex items-center gap-1 text-[11px] text-subtle transition-colors hover:text-foreground"
              >
                Back to inspection list <ArrowRight size={11} />
              </Link>
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

function Inspections() {
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInspections()
      .then((res) => {
        if (!cancelled) setInspections(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statuses = inspections
    ? Array.from(
        new Set(
          inspections
            .map((i) => (i.status ?? "UNKNOWN").toUpperCase())
            .filter((s) => s !== "UNKNOWN"),
        ),
      )
    : [];

  const filtered = (inspections ?? []).filter((i) => {
    if (statusFilter !== "ALL" && (i.status ?? "").toUpperCase() !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${i.assetName ?? ""} ${i.locationName ?? ""} ${i.inspector ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

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
                  Road
                  <br />
                  <span className="text-primary">Inspections</span>
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
                  Every drone survey recorded by the autonomous inspection pipeline. Open an
                  inspection to see the potholes it detected.
                </p>
              </div>
              <div className="text-right text-[11px] text-subtle">
                <p className="text-sm font-medium text-foreground">
                  {inspections == null ? "…" : `${inspections.length} recorded`}
                </p>
                <p>from the AI pipeline database</p>
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
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Search size={14} className="shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search road section, location, inspector…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip
                active={statusFilter === "ALL"}
                onClick={() => setStatusFilter("ALL")}
                label="All"
                count={inspections?.length}
              />
              {statuses.map((s) => (
                <StatusChip
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  label={statusLabel(s)}
                  count={inspections?.filter((i) => (i.status ?? "").toUpperCase() === s).length}
                />
              ))}
            </div>
          </div>

          {inspections == null && !error && (
            <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
              <Radio size={13} /> Loading inspections…
            </div>
          )}

          <div className="mt-6 space-y-3">
            {filtered.length ? (
              filtered.map((i, idx) => {
                const count = i.potholes?.length ?? 0;
                return (
                  <motion.button
                    key={i.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: Math.min(idx * 0.04, 0.4), ease }}
                    onClick={() => setSelectedId(i.id)}
                    className="card-panel flex w-full flex-col gap-3 p-5 text-left transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-subtle">
                        <Radio size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {i.assetName ?? "Road section"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-subtle">
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {i.locationName ?? "No location"}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarDays size={10} /> {formatDate(i.timestamp)}
                          </span>
                          <span className="flex items-center gap-1">
                            {count} pothole{count === 1 ? "" : "s"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border border-border bg-elevated px-2.5 py-1 text-[10px] font-medium ${statusColors[i.status?.toUpperCase() ?? ""] ?? "text-muted-foreground"}`}
                      >
                        {statusLabel(i.status)}
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-subtle" />
                    </div>
                  </motion.button>
                );
              })
            ) : (
              <div className="card-panel flex items-center gap-2 p-5 text-sm text-subtle">
                <TriangleAlert size={14} />
                {inspections == null
                  ? "Loading inspections…"
                  : "No inspections match the current filters."}
              </div>
            )}
          </div>
        </section>
      </main>
      <AppFooter />
      {selectedId && (
        <InspectionDetail inspectionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function StatusChip({
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
