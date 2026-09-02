import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { Nav } from "@/components/rx/Nav";
import { Footer } from "@/components/rx/Footer";
import {
  ArrowLeft,
  Calculator,
  Info,
  MapPin,
  Wrench,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const title = "Pothole Repair Cost Estimator — India | RX";
const description =
  "Estimate pothole repair costs for Indian roads — highways, state roads, city roads, and rural roads. Prices in INR based on IRC & PMGSY standards.";

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

const recentEstimates = [
  { id: "EST-2847", road: "NH-48 — Pune–Mumbai stretch", potholes: 3, total: "₹14,200", date: "Today", method: "Hot Mix Asphalt" },
  { id: "EST-2846", road: "SV Road — Andheri West, Mumbai", potholes: 7, total: "₹8,740", date: "Yesterday", method: "Cold Mix Patch" },
  { id: "EST-2845", road: "JNPT Access Road — Navi Mumbai", potholes: 5, total: "₹22,100", date: "2 days ago", method: "Bituminous Overlay" },
  { id: "EST-2844", road: "PMGSY Road — Raigad District", potholes: 12, total: "₹6,480", date: "3 days ago", method: "WBM Patch" },
];

function formatINR(amount: number): string {
  if (amount >= 100000) {
    return "₹" + (amount / 100000).toFixed(2) + " L";
  }
  return "₹" + amount.toLocaleString("en-IN");
}

function CostEstimator() {
  const [selectedRoad, setSelectedRoad] = useState(0);
  const [selectedSeverity, setSelectedSeverity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(1);

  const road = roadTypes[selectedRoad];
  const severity = severityLevels[selectedSeverity];
  const size = potholeSizes[selectedSize];

  const baseRepairCost = road.baseCost + road.costPerSqm * size.area;
  const severityAdjusted = Math.round(baseRepairCost * severity.multiplier);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
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
              Select road type, pothole severity, and size to get an instant repair cost
              estimate in Indian Rupees. Prices based on IRC SP:83 & PMGSY norms.
            </p>
          </motion.div>
        </section>

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
                        i === selectedRoad
                          ? "border-primary/60 ring-1 ring-primary/30"
                          : ""
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
                        i === selectedSeverity
                          ? "border-primary/60 ring-1 ring-primary/30"
                          : ""
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
                        i === selectedSize
                          ? "border-primary/60 ring-1 ring-primary/30"
                          : ""
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
                    ? "Hot mix asphalt (as per IRC SP:83) — recommended for moderate potholes. Durable 2–3 year fix."
                    : selectedSeverity === 2
                    ? "Bituminous overlay with tack coat — deep repair for severe damage. May need base re-compaction."
                    : "Full-depth reclamation with WBM base + bituminous surface — critical structural repair required."}
                </p>
                <p className="mt-2 text-[11px] text-subtle/60">
                  Based on Indian Roads Congress (IRC) guidelines for {road.name.toLowerCase()} conditions.
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
                  <h3 className="text-sm font-medium text-primary">Estimated Repair Cost</h3>
                  <p className="mt-2 display text-4xl text-primary md:text-5xl">
                    {formatINR(severityAdjusted)}
                  </p>
                  <p className="mt-1 text-xs text-primary/70">per pothole</p>
                </div>

                <div className="space-y-3 p-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Road type</span>
                    <span>{road.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Severity</span>
                    <span>{severity.label} (×{severity.multiplier})</span>
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
                  <button className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5">
                    Export Estimate as PDF
                  </button>
                  <p className="mt-3 flex items-center gap-1 text-center text-[11px] text-subtle">
                    <Info size={12} />
                    Includes materials (bitumen, aggregate) + labor + equipment as per IRC rates
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
                <h4 className="text-xs font-medium text-subtle">Government Reference Rates</h4>
                <ul className="mt-2 space-y-1.5 text-[11px] text-subtle/70">
                  <li>• IRC SP:83 — Patch repair for flexible roads</li>
                  <li>• PMGSY norms — rural road maintenance</li>
                  <li>• NHAI schedule rates 2024–25</li>
                  <li>• BMC ward-level pothole repair avg: ₹500–₹1,500/m²</li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Recent Estimates */}
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

          <div className="mt-8 space-y-3">
            {recentEstimates.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.08, ease }}
                className="card-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs text-primary">{e.id}</span>
                  <div>
                    <p className="text-sm font-medium">{e.road}</p>
                    <p className="text-xs text-subtle">
                      {e.potholes} potholes • {e.method} • {e.date}
                    </p>
                  </div>
                </div>
                <span className="display text-lg text-primary">{e.total}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
