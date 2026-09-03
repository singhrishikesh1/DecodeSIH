import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/rx/AppNav";
import { AppFooter } from "@/components/rx/AppFooter";
import {
  ArrowLeft,
  Calculator,
  Info,
  MapPin,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileDown,
} from "lucide-react";
import { API_BASE, fetchPotholes, type Pothole } from "@/lib/api";
import { formatTimeAgo, severityStyle } from "@/lib/format";

const title = "Pothole Repair Cost Estimator — India | RX";
const description =
  "Plan rough pothole repair costs for Indian roads using an interactive estimator. Reference planning rates only — actual stored repair costs from the AI pipeline are shown below.";

export const Route = createFileRoute("/cost-estimator")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CostEstimator,
});

const ease = [0.16, 1, 0.3, 1] as const;

type RoadType = {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseCost: number; // ₹
  costPerSqm: number; // ₹ per sqm
  examples: string;
};

const roadTypes: RoadType[] = [
  {
    id: "national-highway",
    name: "National Highway",
    icon: "🛣️",
    description: "NHAI-controlled multi-lane highways & expressways",
    baseCost: 1800,
    costPerSqm: 650,
    examples: "NH-44, NH-48, Samruddhi Mahamarg",
  },
  {
    id: "state-highway",
    name: "State Highway",
    icon: "🏛️",
    description: "State PWD maintained roads connecting districts",
    baseCost: 1200,
    costPerSqm: 450,
    examples: "Mumbai–Pune Expressway, Jaipur–Delhi Road",
  },
  {
    id: "city-urban",
    name: "City / Municipal Road",
    icon: "🏙️",
    description: "Urban roads under municipal corporation (BMC, MCGM, etc.)",
    baseCost: 800,
    costPerSqm: 320,
    examples: "SV Road, Link Road, MG Road",
  },
  {
    id: "rural-panchayat",
    name: "Rural / Panchayat Road",
    icon: "🌾",
    description: "PMGSY-built rural connectivity roads",
    baseCost: 400,
    costPerSqm: 180,
    examples: "Village roads, PMGSY Phase I–III roads",
  },
  {
    id: "industrial-port",
    name: "Industrial / Port Road",
    icon: "🏭",
    description: "Heavy vehicle traffic — ports, industrial corridors",
    baseCost: 2200,
    costPerSqm: 800,
    examples: "JNPT access road, DMIC corridor",
  },
];

const severityLevels = [
  {
    label: "Minor",
    multiplier: 0.5,
    description: "Surface cracks, shallow dips < 3 cm",
    color: "text-success",
  },
  {
    label: "Moderate",
    multiplier: 1.0,
    description: "Visible depression 3–8 cm depth",
    color: "text-primary",
  },
  {
    label: "Severe",
    multiplier: 1.8,
    description: "Deep damage > 8 cm, wide cracks, base exposed",
    color: "text-primary",
  },
  {
    label: "Critical",
    multiplier: 2.5,
    description: "Structural failure, full lane blockage",
    color: "text-destructive",
  },
];

type PotholeSize = { label: string; area: number };
const potholeSizes: PotholeSize[] = [
  { label: "Small — < 0.25 m²", area: 0.2 },
  { label: "Medium — 0.25 to 1 m²", area: 0.6 },
  { label: "Large — 1 to 3 m²", area: 2.0 },
  { label: "Very Large — > 3 m²", area: 4.5 },
];

function formatINR(amount: number): string {
  if (amount >= 100000) {
    return "₹" + (amount / 100000).toFixed(2) + " L";
  }
  return "₹" + amount.toLocaleString("en-IN");
}

type EstimateRow = Pothole & { estimate: number };

function CostEstimator() {
  const [selectedRoad, setSelectedRoad] = useState(0);
  const [selectedSeverity, setSelectedSeverity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(1);
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPotholes()
      .then((res) => {
        if (cancelled) return;
        setEstimates(
          res.data
            .map((p) => ({ ...p, estimate: p.totalRepairCost ?? p.estimatedCost ?? 0 }))
            .filter((p) => p.estimate > 0)
            .slice(0, 6),
        );
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const road = roadTypes[selectedRoad] ?? roadTypes[0]!;
  const severity = severityLevels[selectedSeverity] ?? severityLevels[1]!;
  const size = potholeSizes[selectedSize] ?? potholeSizes[1]!;

  const baseRepairCost = road.baseCost + road.costPerSqm * size.area;
  const severityAdjusted = Math.round(baseRepairCost * severity.multiplier);

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="pt-28 pb-16">
        {/* Header */}
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
              <ArrowLeft size={14} />
              Back to home
            </Link>

            <h1 className="display text-4xl md:text-[4.5rem]">
              Pothole Repair
              <br />
              <span className="text-primary">Cost Estimator</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-subtle">
              Choose a road type, pothole severity, and size to get a rough planning figure in
              Indian Rupees. The numbers below are reference planning rates — they are not actual
              repair costs and are not quotes from any standards body. Real stored repair costs
              recorded by the AI pipeline are listed under "Recent Estimates".
            </p>
          </motion.div>
        </section>

        {error && (
          <section className="mx-auto max-w-[1400px] px-5 pt-6 md:px-8">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle size={13} />
              Backend unavailable — estimates from previous detections unavailable. {error}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-[1400px] px-5 md:px-8">
          <div className="mt-14 grid gap-8 md:grid-cols-[1fr_380px] md:gap-12">
            {/* Left: Configurator */}
            <div className="space-y-8">
              {/* Road Type */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease }}
              >
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <MapPin size={18} className="text-primary" />
                  Road Type
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {roadTypes.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoad(i)}
                      className={`card-panel flex flex-col items-start gap-2 p-4 text-left transition-all ${
                        i === selectedRoad ? "border-primary/60 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{r.icon}</span>
                        <span className="text-sm font-medium">{r.name}</span>
                      </div>
                      <p className="text-xs text-subtle">{r.description}</p>
                      <p className="text-[10px] text-subtle/60">{r.examples}</p>
                      <span className="mt-auto pt-1 text-xs text-primary">
                        Base: {formatINR(r.baseCost)} + {formatINR(r.costPerSqm)}/m²
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Severity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease }}
              >
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <AlertTriangle size={18} className="text-primary" />
                  Severity Level
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {severityLevels.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSelectedSeverity(i)}
                      className={`card-panel flex flex-col gap-2 p-4 text-left transition-all ${
                        i === selectedSeverity ? "border-primary/60 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-subtle">{s.description}</span>
                      <span className="mt-auto text-xs text-primary">
                        ×{s.multiplier.toFixed(1)} multiplier
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Pothole Size */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease }}
              >
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <Wrench size={18} className="text-primary" />
                  Pothole Size
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {potholeSizes.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSelectedSize(i)}
                      className={`card-panel flex flex-col gap-2 p-4 text-left transition-all ${
                        i === selectedSize ? "border-primary/60 ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-xs text-subtle">~{s.area} m² area</span>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Method recommendation */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease }}
                className="card-panel p-5"
              >
                <h3 className="text-sm font-medium">Recommended Repair Method</h3>
                <p className="mt-2 text-sm text-subtle">
                  {selectedSeverity <= 0
                    ? "Cold mix patch repair — suitable for minor surface cracks. Quick fix, low cost."
                    : selectedSeverity === 1
                      ? "Hot mix asphalt patching — recommended for moderate potholes. Durable 2–3 year fix."
                      : selectedSeverity === 2
                        ? "Bituminous overlay with tack coat — deep repair for severe damage. May need base re-compaction."
                        : "Full-depth reclamation with WBM base + bituminous surface — critical structural repair required."}
                </p>
                <p className="mt-2 text-[11px] text-subtle/60">
                  General repair guidance for {road.name.toLowerCase()} conditions. This is a
                  planning note, not a stored cost from the pipeline.
                </p>
              </motion.div>
            </div>

            {/* Right: Cost Summary */}
            <div className="md:sticky md:top-24 md:self-start">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease }}
                className="card-panel-active overflow-hidden rounded-2xl"
              >
                <div className="border-b border-primary/20 bg-primary/10 p-6">
                  <h3 className="text-sm font-medium text-primary">Planning Estimate</h3>
                  <p className="mt-1 text-xs text-primary/70">
                    Reference calculation — not an actual stored repair cost
                  </p>
                  <p className="mt-2 display text-4xl text-primary md:text-5xl">
                    {formatINR(severityAdjusted)}
                  </p>
                  <p className="mt-1 text-xs text-primary/70">per pothole (reference inputs)</p>
                </div>

                <div className="space-y-3 p-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Road type</span>
                    <span>{road.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Severity</span>
                    <span>
                      {severity.label} (×{severity.multiplier})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Pothole size</span>
                    <span>{size.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Base cost</span>
                    <span>{formatINR(road.baseCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Per m² rate</span>
                    <span>{formatINR(road.costPerSqm)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Area charge</span>
                    <span>{formatINR(Math.round(road.costPerSqm * size.area))}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>Subtotal</span>
                      <span>{formatINR(baseRepairCost)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-primary">
                      <span>After severity</span>
                      <span>{formatINR(severityAdjusted)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border p-6">
                  <a
                    href={`${API_BASE}/api/reports/full`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    <FileDown size={15} />
                    Download Full Audit Report (PDF)
                  </a>
                  <p className="mt-3 flex items-center gap-1 text-center text-[11px] text-subtle">
                    <Info size={12} />
                    PDF built from real stored detections and their saved repair costs
                  </p>
                </div>
              </motion.div>

              {/* Additional info card */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.5, ease }}
                className="card-panel mt-4 p-5"
              >
                <h4 className="text-xs font-medium text-subtle">Reference planning rates</h4>
                <p className="mt-2 text-[11px] text-subtle/70">
                  The base and per-m² values used above are illustrative planning inputs for rough
                  budgeting. They are not sourced from a specific government rate card and are not
                  quotes. They are only used to give a planning figure — the actual repair costs
                  stored by the AI pipeline are shown in Recent Estimates below.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-subtle/70">
                  <li>Base cost reflects typical bituminous patch repair complexity</li>
                  <li>Per-m² rate scales the estimate with pothole area</li>
                  <li>Severity multiplier adjusts for repair depth</li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Recent Estimates — real backend detections */}
        <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease }}
            className="display text-3xl md:text-[3rem]"
          >
            Recent Estimates
          </motion.h2>
          <p className="mt-3 max-w-lg text-sm text-subtle">
            Repair estimates from detected potholes recorded by the AI pipeline.
          </p>

          <div className="mt-8 space-y-3">
            {estimates.length ? (
              estimates.map((e, i) => {
                const style = severityStyle(e.severity);
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease }}
                    className="card-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-primary">
                        {e.potholeId ?? e.id.slice(0, 8)}
                      </span>
                      <div>
                        <p className="text-sm font-medium">
                          {e.inspection?.locationName ?? e.inspection?.assetName ?? "Road section"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                          <span className={`size-1.5 rounded-full ${style.dot}`} />
                          {style.label} •{" "}
                          {e.depthM != null ? `${(e.depthM * 100).toFixed(0)}cm` : "—"} •
                          {e.areaM2 != null ? ` ${e.areaM2.toFixed(2)} m²` : "—"} •{" "}
                          {formatTimeAgo(e.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className="display text-lg text-primary">{formatINR(e.estimate)}</span>
                  </motion.div>
                );
              })
            ) : (
              <div className="card-panel flex items-center gap-2 p-5 text-sm text-subtle">
                <CheckCircle2 size={14} />
                {loading
                  ? "Loading estimates…"
                  : "No repairs estimated yet — detections with cost data will appear here."}
              </div>
            )}
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
