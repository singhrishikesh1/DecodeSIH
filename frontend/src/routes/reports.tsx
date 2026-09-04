import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import {
  ArrowLeft,
  ArrowRight,
  FileDown,
  FileText,
  Mail,
  Radio,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import {
  API_BASE,
  fetchDashboard,
  fetchInspections,
  fetchPotholes,
  type DashboardData,
  type Inspection,
  type Pothole,
} from "@/lib/api";
import { formatDate, formatINR, formatTimeAgo } from "@/lib/format";

const title = "Reports — Dronacharya pothole detection platform";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Reports,
});

const ease = [0.16, 1, 0.3, 1] as const;

function ReportCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-panel flex items-start gap-3 p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
        <p className="mt-0.5 text-xl font-light">{value}</p>
        <p className="mt-0.5 text-[10px] text-subtle">{sub}</p>
      </div>
    </div>
  );
}

function Reports() {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [potholes, setPotholes] = useState<Pothole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchDashboard(), fetchInspections(), fetchPotholes()]).then((results) => {
      if (cancelled) return;
      const [d, i, p] = results;
      if (d.status === "fulfilled") setDash(d.value.data);
      if (i.status === "fulfilled") setInspections(i.value.data);
      if (p.status === "fulfilled") setPotholes(p.value.data);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        setError(
          failed
            .map((f) => (f.status === "rejected" ? (f.reason as Error).message : ""))
            .join("; "),
        );
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = dash?.summary;
  const currency = summary?.currency ?? "₹";
  const critical = (potholes ?? []).filter(
    (p) => (p.severity ?? "").toUpperCase() === "CRITICAL",
  ).length;
  const high = (potholes ?? []).filter((p) => (p.severity ?? "").toUpperCase() === "HIGH").length;
  const unclassified = (potholes ?? []).filter(
    (p) => (p.severity ?? "").toUpperCase() === "UNCLASSIFIED",
  ).length;
  const withGps = (potholes ?? []).filter((p) => p.gpsAvailable).length;
  const withoutGps = (potholes ?? []).filter((p) => !p.gpsAvailable).length;

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
                  Audit
                  <br />
                  <span className="text-primary">Reports</span>
                </h1>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
                  Downloadable audit reports generated from real detections — every pothole,
                  estimate, and inspection recorded by the pipeline.
                </p>
              </div>
              <div className="text-right text-[11px] text-subtle">
                {loading ? (
                  <p className="text-sm font-medium text-foreground">Loading…</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {potholes?.length ?? 0} potholes
                    </p>
                    <p>across {inspections?.length ?? 0} inspections</p>
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
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportCard
              icon={<FileText size={15} />}
              label="Potholes detected"
              value={loading ? "—" : String(potholes?.length ?? 0)}
              sub="records in the database"
            />
            <ReportCard
              icon={<TriangleAlert size={15} />}
              label="Critical / High"
              value={loading ? "—" : String(critical + high)}
              sub={`${critical} critical · ${high} high`}
            />
            <ReportCard
              icon={<Radio size={15} />}
              label="GPS coverage"
              value={loading ? "—" : `${withGps} / ${(potholes?.length ?? 0) || 1}`}
              sub={`${withoutGps} without GPS fix`}
            />
            <ReportCard
              icon={<FileDown size={15} />}
              label="Estimated budget"
              value={loading ? "—" : formatINR(summary?.totalEstimatedBudget ?? 0)}
              sub={`${summary?.totalInspections ?? 0} inspections recorded`}
            />
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 pt-12 md:px-8">
          <div className="card-panel-active overflow-hidden rounded-2xl">
            <div className="border-b border-primary/20 bg-primary/10 p-6">
              <h2 className="text-sm font-medium">Full Audit Report</h2>
              <p className="mt-1 text-[11px] text-primary/70">
                One PDF covering all potholes across every recorded inspection, with materials,
                labour, and equipment estimated from stored cost data only.
              </p>
            </div>
            <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] text-subtle">
                <p>Includes {potholes?.length ?? 0} detected potholes.</p>
                <p>Generated from the backend database state at download time.</p>
              </div>
              <a
                href={`${API_BASE}/api/reports/full`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                <FileDown size={15} />
                Download full audit report (PDF)
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 py-12 md:px-8">
          <h2 className="text-lg font-medium">Per-inspection reports</h2>
          <p className="mt-1 max-w-lg text-[11px] text-subtle">
            A separate PDF is available for each completed inspection.
          </p>
          <div className="mt-5 space-y-3">
            {inspections == null && !error && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-[11px] text-subtle">
                <Radio size={13} /> Loading inspections…
              </div>
            )}
            {inspections != null && !inspections.length && (
              <p className="text-[11px] text-subtle">No inspections recorded yet.</p>
            )}
            {inspections?.map((i, idx) => {
              const n = i.potholes?.length ?? 0;
              return (
                <motion.div
                  key={i.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: Math.min(idx * 0.04, 0.4), ease }}
                  className="card-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.assetName ?? "Road section"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-subtle">
                      <span>{i.locationName ?? "No location"}</span>
                      <span>{formatDate(i.timestamp)}</span>
                      <span>status {i.status ?? "—"}</span>
                      <span>
                        {n} pothole{n === 1 ? "" : "s"}
                      </span>
                      <span>{formatTimeAgo(i.timestamp)}</span>
                    </p>
                  </div>
                  <a
                    href={`${API_BASE}/api/reports/pdf/${encodeURIComponent(i.legacyId || i.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium transition-colors hover:border-foreground/30"
                  >
                    <FileDown size={13} />
                    PDF report
                  </a>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 pb-6 md:px-8">
          <div className="card-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-medium">
                <Mail size={13} className="text-primary" />
                Email an inspection report
              </h3>
              <p className="mt-1 text-[11px] text-subtle">
                Ask the backend to email the PDF report for a specific inspection to any address.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Link
                to="/inspections"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 font-medium transition-colors hover:border-foreground/30"
              >
                Open inspections <ArrowRight size={12} />
              </Link>
              <Link
                to="/defects"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 font-medium transition-colors hover:border-foreground/30"
              >
                Browse defects <ArrowRight size={12} />
              </Link>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-subtle">
            Report totals ( {unclassified} unclassified ·{" "}
            {Math.max(0, (potholes?.length ?? 0) - critical - high - unclassified)} other ) are
            computed live from the backend database — no values are invented client-side.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
