import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
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
  Camera,
  Ruler,
  Package,
  HardHat,
  Truck,
  Cog,
  ShieldAlert,
  CircleDollarSign,
} from "lucide-react";
import {
  API_BASE,
  mediaUrl,
  fetchCostPotholes,
  fetchCostOptions,
  fetchStoredEstimate,
  postCalculateCost,
  type CostPothole,
  type CostOptions,
  type CostEstimateResult,
  type CostLineItem,
  type StoredEstimate,
} from "@/lib/api";
import {
  formatINR,
  formatConfidence,
  formatMeasurement,
  formatCoord,
  formatTimeAgo,
  formatDate,
  severityStyle,
  gpsStatusText,
} from "@/lib/format";

const title = "Pothole Repair Cost Estimator — Dronacharya";
const description =
  "Deterministic engineering repair cost estimate from validated drone measurements, regional rate catalog and a governed bill of quantities. Not an invoice.";

export const Route = createFileRoute("/cost-estimator")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CostEstimator,
});

const ease = [0.16, 1, 0.3, 1] as const;

// Human-readable labels for the backend enums (no fabricated values — only ever
// maps strings the backend actually sends).
const MATERIAL_LABELS: Record<string, string> = {
  BITUMINOUS: "Bituminous",
  CONCRETE: "Concrete / PCC",
  WMM: "Wet Mix Macadam",
  OTHER: "Other / Manual spec",
};

const ROAD_LABELS: Record<string, string> = {
  NATIONAL_HIGHWAY: "National Highway",
  STATE_HIGHWAY: "State Highway",
  MUNICIPAL: "Municipal Road",
  RURAL: "Rural / Panchayat",
  OTHER: "Other",
};

const METHOD_LABELS: Record<string, string> = {
  COLD_MIX_PATCH: "Cold mix patch",
  HOT_MIX_PATCH: "Hot mix asphalt patch",
  DEEP_PATCH: "Deep / full-depth patch",
  BITUMINOUS_PATCH: "Bituminous patch repair",
  PCC_PATCH: "PCC / concrete patch",
  CONCRETE_PATCH: "Concrete patch",
  BONDED_CONCRETE_PATCH: "Bonded concrete patch",
  WMM_BASE_REBUILD: "WMM granular base rebuild",
  MANUAL_SPEC: "Manual engineering specification",
};

const methodLabel = (m: string | null | undefined) => METHOD_LABELS[m ?? ""] ?? m ?? "—";

function CostEstimator() {
  const [potholes, setPotholes] = useState<CostPothole[]>([]);
  const [options, setOptions] = useState<CostOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roadMaterial, setRoadMaterial] = useState("BITUMINOUS");
  const [roadType, setRoadType] = useState("STATE_HIGHWAY");
  const [repairMethod, setRepairMethod] = useState<string>("");
  const [regionState, setRegionState] = useState("Maharashtra");
  const [regionCity, setRegionCity] = useState("Pune");
  const [roadAuthority, setRoadAuthority] = useState("State PWD");

  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CostEstimateResult | null>(null);
  const [stored, setStored] = useState<StoredEstimate | null>(null);
  const [unavailable, setUnavailable] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCostPotholes(), fetchCostOptions()])
      .then(([p, o]) => {
        if (cancelled) return;
        setPotholes(p.data);
        setOptions(o.data);
        // sensible defaults from the backend catalog
        const s0 = o.data.regions.states[0];
        const c0 = o.data.regions.cities[0];
        if (s0) setRegionState(s0);
        if (c0) setRegionCity(c0);
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

  const authorities = useMemo(
    () => options?.regions.authorities ?? ["NHAI", "State PWD", "Municipal", "National"],
    [options],
  );

  // Default repair method per selected material (first offered by backend).
  useEffect(() => {
    const methods = options?.repairMethodsByMaterial?.[roadMaterial];
    if (methods?.length) {
      setRepairMethod((prev) => (prev && methods.includes(prev) ? prev : methods[0]!));
    }
  }, [roadMaterial, options]);

  const selected = useMemo(
    () => potholes.find((p) => p.id === selectedId) ?? null,
    [potholes, selectedId],
  );

  // On selecting a pothole, prefill material/type/method if stored, and load any
  // previously persisted estimate (reproducibility).
  useEffect(() => {
    setResult(null);
    setStored(null);
    setUnavailable(null);
    setCalError(null);
    if (!selected) return;
    if (selected.roadMaterial) setRoadMaterial(selected.roadMaterial);
    if (selected.roadType) setRoadType(selected.roadType);
    if (selected.repairMethod) setRepairMethod(selected.repairMethod);
    let cancelled = false;
    fetchStoredEstimate(selected.id)
      .then((res) => {
        if (cancelled || !res.data) return;
        setStored(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canCalculate = !!selected && selected.eligibleForCosting;

  async function handleCalculate() {
    if (!selected || !canCalculate) return;
    setCalculating(true);
    setCalError(null);
    setUnavailable(null);
    setResult(null);
    try {
      const data = await postCalculateCost({
        potholeId: selected.id,
        roadType,
        roadMaterial,
        repairMethod,
        region: { state: regionState, city: regionCity },
        roadAuthority,
      });
      setResult(data);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "COST_UNAVAILABLE" || err.code === "RATE_UNAVAILABLE") {
        setUnavailable({ code: err.code, message: err.message });
      } else {
        setCalError(err.message);
      }
    } finally {
      setCalculating(false);
    }
  }

  function exportCSV() {
    const r = result;
    if (!r) return;
    const rows: string[][] = [];
    rows.push(["Pothole Repair Cost Estimate — Calculated"]);
    rows.push(["Pothole ID", r.pothole.potholeId ?? ""]);
    rows.push(["Location", r.pothole.locationName ?? ""]);
    rows.push(["Road material", r.road.material ?? ""]);
    rows.push(["Road type", r.road.roadType ?? ""]);
    rows.push(["Repair method", r.repair.method ?? ""]);
    rows.push(["Volume (m³)", r.geometry?.volumeM3?.toFixed(4) ?? ""]);
    rows.push(["Area (m²)", r.geometry?.areaM2?.toFixed(4) ?? ""]);
    rows.push([""]);
    rows.push(["Material", "Quantity", "Unit", "Rate (₹)", "Amount (₹)"]);
    r.materials.forEach((l) => rows.push([l.item, String(l.quantity), l.unit, String(l.rate), l.amount.toFixed(2)]));
    r.labour.forEach((l) => rows.push([`Labour — ${l.item}`, String(l.quantity), l.unit, String(l.rate), l.amount.toFixed(2)]));
    r.equipment.forEach((l) => rows.push([`Equipment — ${l.item}`, String(l.quantity), l.unit, String(l.rate), l.amount.toFixed(2)]));
    r.transport.forEach((l) => rows.push([`Transport — ${l.item}`, String(l.quantity), l.unit, String(l.rate), l.amount.toFixed(2)]));
    rows.push([""]);
    rows.push(["Subtotal (₹)", "", "", "", r.subtotal.toFixed(2)]);
    if (r.tax) rows.push(["Tax (₹)", "", "", "", r.tax.toFixed(2)]);
    if (r.contingency) rows.push(["Contingency (₹)", "", "", "", r.contingency.toFixed(2)]);
    rows.push(["TOTAL (₹)", "", "", "", r.totalEstimatedCost.toFixed(2)]);
    rows.push([""]);
    rows.push(["Rate source", r.rateSource]);
    rows.push(["Rate effective date", r.rateEffectiveDate]);
    rows.push(["Generated", new Date().toISOString()]);
    const csv = rows.map((rrow) => rrow.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repair-estimate-${(r.pothole.potholeId ?? r.pothole.id).slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedEligible = selected?.eligibleForCosting ?? false;

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
              A deterministic engineering repair cost from validated drone measurements, a regional
              rate catalog and a governed bill of quantities. Always labeled{" "}
              <span className="text-foreground">Calculated Repair Estimate</span> — not an
              invoice.
            </p>
          </motion.div>
        </section>

        {error && (
          <section className="mx-auto max-w-[1400px] px-5 pt-6 md:px-8">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle size={13} />
              Backend unavailable: {error}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-[1400px] px-5 md:px-8">
          <div className="mt-14 grid gap-8 lg:grid-cols-[400px_1fr] lg:gap-10">
            {/* ── Left: Pothole + configuration ─────────────────────────────── */}
            <div className="space-y-8">
              {/* Pothole selector */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease }}
              >
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <MapPin size={18} className="text-primary" />
                  Select a Detected Pothole
                </h2>
                {loading ? (
                  <div className="card-panel mt-4 p-5 text-sm text-subtle">Loading detections…</div>
                ) : !potholes.length ? (
                  <div className="card-panel mt-4 flex items-center gap-2 p-5 text-sm text-subtle">
                    <ShieldAlert size={14} />
                    No pothole detections found in the pipeline.
                  </div>
                ) : (
                  <div className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1">
                    {potholes.map((p) => {
                      const style = severityStyle(p.severity);
                      const activeSelect = p.id === selectedId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`card-panel flex w-full items-center justify-between gap-3 p-3 text-left transition-all ${
                            activeSelect ? "border-primary/60 ring-1 ring-primary/30" : ""
                          } ${!p.eligibleForCosting ? "opacity-70" : ""}`}
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              <span className="text-primary">{p.potholeId ?? p.id.slice(0, 8)}</span>
                              {!p.eligibleForCosting && (
                                <span className="rounded bg-elevated px-1.5 py-0.5 text-[9px] text-subtle">
                                  no measurements
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-subtle">
                              {p.locationName ?? "Road section"}
                            </p>
                            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-subtle/70">
                              <span className={`size-1.5 rounded-full ${style.dot}`} />
                              {style.label} • {formatTimeAgo(p.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end text-[11px] text-subtle">
                            {p.measuredAreaM2 != null ? (
                              <span>{p.measuredAreaM2.toFixed(2)} m²</span>
                            ) : (
                              <span>—</span>
                            )}
                            {p.measuredDepthCM != null ? (
                              <span>{p.measuredDepthCM.toFixed(1)} cm</span>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* Selected measurements + evidence */}
              {selected && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease }}
                  className="card-panel p-5"
                >
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Camera size={15} className="text-primary" />
                    Evidence &amp; Measurements
                  </h3>
                  {selected.imagePath ? (
                    <img
                      src={mediaUrl(selected.imagePath)}
                      alt={`${selected.potholeId ?? "pothole"} evidence`}
                      className="mt-3 aspect-video w-full rounded-lg border border-border object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="mt-3 flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-elevated text-xs text-subtle">
                      No evidence image stored
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-subtle">Confidence</p>
                      <p className="mt-0.5 font-medium">{formatConfidence(selected.confidence)}</p>
                    </div>
                    <div>
                      <p className="text-subtle">Area</p>
                      <p className="mt-0.5 font-medium">
                        {formatMeasurement(selected.measuredAreaM2, "m²")}
                      </p>
                    </div>
                    <div>
                      <p className="text-subtle">Volume</p>
                      <p className="mt-0.5 font-medium">
                        {formatMeasurement(selected.measuredVolumeM3, "m³", 4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-subtle">Depth</p>
                      <p className="mt-0.5 font-medium">
                        {formatMeasurement(selected.measuredDepthCM, "cm", 1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-subtle">GPS</p>
                      <p className="mt-0.5 font-medium">{formatCoord(selected.latitude, selected.longitude)}</p>
                    </div>
                    <div>
                      <p className="text-subtle">Measurement status</p>
                      <p className="mt-0.5 font-medium capitalize">
                        {selected.measurementStatus || "uncalibrated"}
                      </p>
                    </div>
                  </div>
                  {!selectedEligible && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      This detection has no validated volume/area yet (measurements uncalibrated). A
                      quantity-based repair cost cannot be honestly calculated.
                    </div>
                  )}
                </motion.div>
              )}

              {/* Configuration */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease }}
                className="card-panel p-5"
              >
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <Wrench size={16} className="text-primary" />
                  Repair Configuration
                </h2>
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <label className="text-xs text-subtle">Road material</label>
                    <select
                      value={roadMaterial}
                      onChange={(e) => setRoadMaterial(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                    >
                      {(options?.roadMaterials ?? ["BITUMINOUS", "CONCRETE", "WMM", "OTHER"]).map(
                        (m) => (
                          <option key={m} value={m}>
                            {MATERIAL_LABELS[m] ?? m}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-subtle">Road type</label>
                    <select
                      value={roadType}
                      onChange={(e) => setRoadType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                    >
                      {(options?.roadTypes ?? ["NATIONAL_HIGHWAY", "STATE_HIGHWAY", "MUNICIPAL", "RURAL", "OTHER"]).map(
                        (t) => (
                          <option key={t} value={t}>
                            {ROAD_LABELS[t] ?? t}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-subtle">Repair method</label>
                    <select
                      value={repairMethod}
                      onChange={(e) => setRepairMethod(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                    >
                      {(options?.repairMethodsByMaterial?.[roadMaterial] ?? []).map((mth) => (
                        <option key={mth} value={mth}>
                          {methodLabel(mth)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-subtle">Region / State</label>
                      <select
                        value={regionState}
                        onChange={(e) => setRegionState(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                      >
                        {(options?.regions.states ?? ["Maharashtra"]).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-subtle">City</label>
                      <select
                        value={regionCity}
                        onChange={(e) => setRegionCity(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                      >
                        {(options?.regions.cities ?? ["Pune"]).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-subtle">Road authority</label>
                    <select
                      value={roadAuthority}
                      onChange={(e) => setRoadAuthority(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                    >
                      {authorities.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  disabled={!selected || !selectedEligible || calculating}
                  onClick={handleCalculate}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  <Calculator size={15} />
                  {calculating ? "Calculating…" : "Calculate Repair Estimate"}
                </button>
                <p className="mt-2 text-center text-[10px] text-subtle">
                  Uses validated DB measurements + regional rate catalog. Deterministic.
                </p>
              </motion.div>
            </div>

            {/* ── Right: Results ────────────────────────────────────────────── */}
            <div className="space-y-6">
              {calError && (
                <div className="card-panel flex items-center gap-2 p-4 text-sm text-destructive">
                  <AlertTriangle size={15} />
                  {calError}
                </div>
              )}

              {unavailable && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="card-panel-active overflow-hidden rounded-2xl border border-amber-500/30"
                >
                  <div className="flex items-start gap-3 bg-amber-500/10 p-6">
                    <ShieldAlert size={20} className="mt-0.5 text-amber-500" />
                    <div>
                      <h3 className="text-sm font-medium text-amber-500">
                        COST ESTIMATION UNAVAILABLE
                      </h3>
                      <p className="mt-1 max-w-md text-sm text-amber-500/80">{unavailable.message}</p>
                      <p className="mt-2 text-[11px] text-subtle">
                        The engine never fabricates volume, depth or rates. It needs validated
                        measurements and applicable regional rates.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {!selected ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease }}
                  className="card-panel flex flex-col items-center justify-center p-10 text-center"
                >
                  <CircleDollarSign size={28} className="text-subtle" />
                  <p className="mt-3 text-sm font-medium">No pothole selected</p>
                  <p className="mt-1 max-w-sm text-xs text-subtle">
                    Choose a detected pothole on the left. Its calibrated measurements will drive an
                    engineering repair cost.
                  </p>
                </motion.div>
              ) : !selectedEligible ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease }}
                  className="card-panel-active overflow-hidden rounded-2xl border border-amber-500/30"
                >
                  <div className="flex items-start gap-3 bg-amber-500/10 p-6">
                    <ShieldAlert size={20} className="mt-0.5 text-amber-500" />
                    <div>
                      <h3 className="text-sm font-medium text-amber-500">
                        COST ESTIMATION UNAVAILABLE
                      </h3>
                      <p className="mt-1 max-w-md text-sm text-amber-500/80">
                        This detection has no validated physical measurements (depth, area or
                        volume). A quantity-based repair cost cannot be honestly computed.
                      </p>
                      <p className="mt-2 text-[11px] text-subtle">
                        GPS: {gpsStatusText(selected.gpsAvailable, selected.gpsStatus)} • Depth:{" "}
                        {formatMeasurement(selected.depthM != null ? selected.depthM * 100 : null, "cm", 1)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : result ? (
                <ResultPanel result={result} exporting={exportCSV} showFormula={showFormula} setShowFormula={setShowFormula} />
              ) : stored ? (
                <ResultPanel
                  result={storedToResult(stored, selected)}
                  exporting={exportCSV}
                  showFormula={showFormula}
                  setShowFormula={setShowFormula}
                  storedBanner
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease }}
                  className="card-panel flex flex-col items-center justify-center p-10 text-center"
                >
                  <Calculator size={28} className="text-subtle" />
                  <p className="mt-3 text-sm font-medium">Ready to calculate</p>
                  <p className="mt-1 max-w-sm text-xs text-subtle">
                    Configure the repair above and press "Calculate Repair Estimate" to generate the
                    bill of quantities and total.
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

// ── Result panel ─────────────────────────────────────────────────────────────

function storedToResult(s: StoredEstimate, p: CostPothole): CostEstimateResult {
  return {
    potholeId: p.potholeId,
    pothole: {
      id: p.id,
      potholeId: p.potholeId,
      imagePath: p.imagePath,
      confidence: p.confidence,
      latitude: p.latitude,
      longitude: p.longitude,
      locationName: p.locationName,
    },
    geometry: s.geometry,
    road: {
      material: s.roadMaterial,
      roadType: s.roadType,
      region: s.regionState,
      state: s.regionState,
      city: s.regionCity,
      authority: s.roadAuthority ?? null,
    },
    repair: {
      method: s.repairMethod,
      compactionAllowance: (s.formula?.allowanceFactor as number) ?? 0.08,
      densityKgM3: (s.formula?.densityKgM3 as number) ?? 0,
      requiredMassKg: (s.formula?.requiredMassKg as number) ?? 0,
      looseVolumeM3: (s.formula?.looseVolumeM3 as number) ?? 0,
    },
    materials: Array.isArray(s.materials) ? s.materials : [],
    labour: Array.isArray(s.labour) ? s.labour : [],
    equipment: Array.isArray(s.equipment) ? s.equipment : [],
    transport: Array.isArray(s.transport) ? s.transport : [],
    materialSubtotal: s.materialSubtotal,
    labourSubtotal: s.labourSubtotal,
    equipmentSubtotal: s.equipmentSubtotal,
    transportSubtotal: s.transportSubtotal,
    allowance: s.allowance ?? 0,
    subtotal: s.subtotal ?? 0,
    tax: s.tax ?? 0,
    contingency: s.contingency ?? 0,
    totalEstimatedCost: s.total,
    currency: s.currency,
    rateSource: s.rateSource ?? "",
    rateEffectiveDate: s.rateEffectiveDate ?? "",
    formula: s.formula,
    calculationStatus: s.calculationStatus,
    storedEstimateId: s.id,
  };
}

function ResultPanel({
  result: r,
  exporting,
  showFormula,
  setShowFormula,
  storedBanner,
}: {
  result: CostEstimateResult;
  exporting: () => void;
  showFormula: boolean;
  setShowFormula: (v: boolean) => void;
  storedBanner?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="card-panel-active overflow-hidden rounded-2xl"
    >
      {storedBanner && (
        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-6 py-2 text-[11px] text-primary">
          <CheckCircle2 size={12} />
          Showing the previously persisted estimate for this pothole (reproducible). Recalculate to
          refresh from the current rate catalog.
        </div>
      )}
      <div className="border-b border-primary/20 bg-primary/10 p-6">
        <h3 className="text-sm font-medium text-primary">Calculated Repair Estimate</h3>
        <p className="mt-1 text-xs text-primary/70">
          {r.pothole.potholeId ?? r.pothole.id.slice(0, 8)} • {r.road.material ?? "—"} •{" "}
          {methodLabel(r.repair.method)}
        </p>
        <p className="mt-2 display text-4xl text-primary md:text-5xl">
          {formatINR(r.totalEstimatedCost)}
        </p>
        <p className="mt-1 text-xs text-primary/70">
          {r.currency} • engineering estimate, not an invoice
        </p>
      </div>

      <div className="space-y-5 p-6">
        {/* Measurement */}
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Metric label="Volume" value={r.geometry?.volumeM3 != null ? `${r.geometry.volumeM3.toFixed(4)} m³` : "—"} />
          <Metric label="Area" value={r.geometry?.areaM2 != null ? `${r.geometry.areaM2.toFixed(3)} m²` : "—"} />
          <Metric label="Avg depth" value={r.geometry?.avgDepthCm != null ? `${r.geometry.avgDepthCm.toFixed(1)} cm` : "—"} />
          <Metric label="Volume source" value={r.geometry?.volumeSource ?? "—"} />
        </div>

        {/* BOQ */}
        <section>
          <h4 className="flex items-center gap-2 text-xs font-medium text-subtle">
            <Package size={13} /> Materials
          </h4>
          <BOQTable rows={r.materials} />
        </section>
        <section>
          <h4 className="flex items-center gap-2 text-xs font-medium text-subtle">
            <HardHat size={13} /> Labour
          </h4>
          <BOQTable rows={r.labour} />
        </section>
        <section>
          <h4 className="flex items-center gap-2 text-xs font-medium text-subtle">
            <Cog size={13} /> Equipment
          </h4>
          <BOQTable rows={r.equipment} />
        </section>
        <section>
          <h4 className="flex items-center gap-2 text-xs font-medium text-subtle">
            <Truck size={13} /> Transport
          </h4>
          <BOQTable rows={r.transport} />
        </section>

        {/* Summary */}
        <div className="rounded-lg border border-border p-4 text-sm">
          <Row label="Materials" value={formatINR(r.materialSubtotal)} />
          <Row label="Labour" value={formatINR(r.labourSubtotal)} />
          <Row label="Equipment" value={formatINR(r.equipmentSubtotal)} />
          <Row label="Transport" value={formatINR(r.transportSubtotal)} />
          {r.tax > 0 && <Row label="Tax" value={formatINR(r.tax)} />}
          {r.contingency > 0 && <Row label="Contingency" value={formatINR(r.contingency)} />}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-base font-semibold text-primary">
            <span>Total</span>
            <span>{formatINR(r.totalEstimatedCost)}</span>
          </div>
        </div>

        {/* Source + how calculated */}
        <div className="rounded-lg border border-border p-4">
          <h4 className="flex items-center gap-2 text-xs font-medium text-subtle">
            <Info size={13} /> Rate source &amp; calculation
          </h4>
          <p className="mt-2 text-xs text-subtle">
            <span className="text-foreground">Source:</span> {r.rateSource || "Reference rate catalog"}
          </p>
          <p className="mt-1 text-xs text-subtle">
            <span className="text-foreground">Effective date:</span>{" "}
            {r.rateEffectiveDate || "—"}
          </p>
          <p className="mt-1 text-xs text-subtle">
            <span className="text-foreground">Measurement basis:</span>{" "}
            {r.geometry?.volumeM3 != null ? `${r.geometry.volumeM3.toFixed(4)} m³ (${r.geometry.volumeSource})` : "—"}
          </p>
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Ruler size={12} />
            {showFormula ? "Hide" : "Show"} — "How was this calculated?"
          </button>
          {showFormula && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-elevated p-3 text-[11px] leading-relaxed text-subtle">
              {JSON.stringify(r.formula, null, 2)}
            </pre>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={exporting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <FileDown size={15} />
            Export BOQ (CSV)
          </button>
          <a
            href={`${API_BASE}/api/reports/full`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-subtle transition-colors hover:text-foreground"
          >
            <FileDown size={15} />
            Full Audit Report (PDF)
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-panel p-3">
      <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-subtle">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function BOQTable({ rows }: { rows: CostLineItem[] }) {
  if (!rows.length) return <p className="mt-1 text-xs text-subtle">—</p>;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-elevated text-left text-subtle">
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Rate</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">{l.item}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {l.quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {l.unit}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.rate)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {formatINR(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CostEstimator;
