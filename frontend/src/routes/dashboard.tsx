import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  LayoutGrid,
  Bell,
  Search,
  Settings,
  BarChart3,
  MoreHorizontal,
  Radio,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Package,
  LogOut,
  MapPin,
  FileDown,
  CalendarCheck,
  Wrench,
  Calculator,
} from "lucide-react";
import {
  API_BASE,
  fetchDashboard,
  fetchDrones,
  fetchPotholes,
  type DashboardData,
  type Drone,
  type Inspection,
  type Pothole,
} from "@/lib/api";
import { formatINR, formatTimeAgo, droneStatusText } from "@/lib/format";
import { DeviceLocationMap } from "@/components/rx/DeviceLocationMap";

const title = "Overview — RX pothole detection platform";
const description =
  "Live drone-based road scanning operations: active survey drones, detected potholes, inspection routes, and real-time alerts on one map-first dashboard.";

export const Route = createFileRoute("/dashboard")({
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
  component: Dashboard,
});

const ease = [0.16, 1, 0.3, 1] as const;

const railLinks = [
  { icon: LayoutGrid, to: "/dashboard" as const, label: "Overview" },
  { icon: CalendarCheck, to: "/inspections" as const, label: "Inspections" },
  { icon: MapPin, to: "/map" as const, label: "Map" },
  { icon: Wrench, to: "/defects" as const, label: "Defects & Repairs" },
  { icon: BarChart3, to: "/reports" as const, label: "Reports" },
  { icon: Settings, to: "/dashboard" as const, label: "Settings" },
  { icon: Radio, to: "/live" as const, label: "Live AI View" },
  { icon: Calculator, to: "/cost-estimator" as const, label: "Cost Estimator" },
];

function toneClass(tone: string) {
  if (tone === "warn") return "text-destructive";
  if (tone === "ok") return "text-success";
  return "text-muted-foreground";
}

function DroneGlyph({ size = 26 }: { size?: number }) {
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

type GpsPoint = { lat: number | null; lng: number | null };

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.startsWith("INS-")) return id;
  return id.slice(0, 8).toUpperCase();
}

function inspectionTone(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "RESOLVED":
      return "ok";
    case "FAILED":
    case "ERROR":
      return "warn";
    default:
      return "muted";
  }
}

function inspectionStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "RESOLVED":
      return "Resolved";
    case "COMPLETED":
      return "Complete";
    case "FAILED":
    case "ERROR":
      return "Failed";
    case "IN_PROGRESS":
      return "Running";
    default:
      return status ?? "—";
  }
}

function potholeTone(severity: string | null | undefined): string {
  switch ((severity ?? "").toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return "warn";
    case "MEDIUM":
    case "LOW":
      return "ok";
    default:
      return "muted";
  }
}

type NotificationItem = {
  icon: typeof CheckCircle2;
  tone: "ok" | "warn" | "muted";
  title: string;
  body: string;
  time: string;
};

function buildNotifications(inspections: Inspection[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const insp of inspections) {
    const potholes = insp.potholes ?? [];
    if (!potholes.length) continue;
    const critical = potholes.find((p) => (p.severity ?? "").toUpperCase() === "CRITICAL");
    const high = critical
      ? undefined
      : potholes.find((p) => (p.severity ?? "").toUpperCase() === "HIGH");
    const totalEst = potholes.reduce(
      (sum, p) => sum + (p.estimatedCost ?? p.totalRepairCost ?? 0),
      0,
    );
    const place = insp.locationName ?? insp.assetName ?? "road section";

    if (critical) {
      items.push({
        icon: AlertTriangle,
        tone: "warn",
        title: `${critical.potholeId ?? "Pothole"} · critical pothole on ${place}`,
        body: `Est. repair ${formatINR(totalEst)} — auto-flagged for repair`,
        time: formatTimeAgo(insp.timestamp),
      });
    } else if (high) {
      items.push({
        icon: AlertTriangle,
        tone: "warn",
        title: `${high.potholeId ?? "Pothole"} · high-risk pothole on ${place}`,
        body: `Est. repair ${formatINR(totalEst)} — flagged for repair`,
        time: formatTimeAgo(insp.timestamp),
      });
    } else {
      items.push({
        icon: Package,
        tone: "ok",
        title: `Scan ${shortId(insp.legacyId)} completed — ${potholes.length} pothole${potholes.length === 1 ? "" : "s"} found`,
        body: `Repair estimate ${formatINR(totalEst)}`,
        time: formatTimeAgo(insp.timestamp),
      });
    }
  }
  if (!items.length) {
    items.push({
      icon: CheckCircle2,
      tone: "muted",
      title: "No detections yet",
      body: "Notifications appear when surveys detect potholes.",
      time: "",
    });
  }
  return items.slice(0, 3);
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchDashboard(), fetchDrones(), fetchPotholes()]).then((results) => {
      if (cancelled) return;
      const [dash, dr, poth] = results;
      if (dash.status === "fulfilled") setData(dash.value.data);
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
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = data?.summary;
  const fleet = data?.fleet;
  const recentInspections = data?.recentInspections ?? [];
  const activeDrones = fleet?.activeDrones ?? drones.filter((d) => d.status === "FLYING").length;
  const totalDrones = fleet?.totalDrones ?? drones.length;

  const stats = [
    {
      label: "Active Survey Drones",
      value: loading ? "—" : String(activeDrones),
      suffix: totalDrones ? `/${totalDrones}` : "",
    },
    { label: "Potholes Detected", value: loading ? "—" : String(potholes.length) },
    { label: "Total Inspections", value: loading ? "—" : String(summary?.totalInspections ?? 0) },
    {
      label: "Repair Budget",
      value: loading ? "—" : formatINR(summary?.totalEstimatedBudget ?? 0),
      suffix: "",
    },
  ];

  const notifications = buildNotifications(recentInspections);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-10">
        {/* frame labels, like the reference deck */}
        <div className="mb-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            pothole <span className="text-subtle">detection</span>
          </span>
          <span className="text-right">
            real-time
            <br />
            monitoring
          </span>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            <AlertTriangle size={13} />
            Backend unavailable at {API_BASE} — showing cached/unavailable state. {error}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_-40px_rgba(20,25,40,0.25)]"
        >
          {/* top bar */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-subtle transition-colors hover:text-foreground"
            >
              <ArrowLeft size={14} /> Back to home
            </Link>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DroneGlyph size={18} />
            </span>
            <h1 className="text-lg font-medium">Overview</h1>

            <div className="mx-auto hidden w-full max-w-md items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground md:flex">
              <Search size={14} />
              <span>Search potholes, road sections, surveys...</span>
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <a
                href={`${API_BASE}/api/reports/full`}
                target="_blank"
                rel="noreferrer"
                className="flex size-8 items-center justify-center gap-2 rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                title="Download full audit report (PDF)"
              >
                <FileDown size={14} />
              </a>
              <button className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground">
                <Radio size={14} />
              </button>
              <button className="relative flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground">
                <Bell size={14} />
                {potholes.some((p) => (p.severity ?? "").toUpperCase() === "CRITICAL") && (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />
                )}
              </button>
              <span className="flex size-8 items-center justify-center rounded-lg bg-elevated text-[10px] font-medium">
                JD
              </span>
              <Link
                to="/"
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Back to site"
              >
                <LogOut size={14} />
              </Link>
            </div>
          </div>

          <div className="flex">
            {/* icon rail with page links */}
            <div className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border py-4 md:flex">
              {railLinks.map((item, i) => (
                <Link
                  key={i}
                  to={item.to}
                  className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
                    item.to === "/dashboard" && i === 0
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                  }`}
                  title={item.label}
                >
                  <item.icon size={16} />
                </Link>
              ))}
              {potholes.length > 0 && (
                <span className="mt-2 text-[9px] text-subtle">{potholes[0]?.potholeId ?? "—"}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {/* map — current browser device location via Leaflet + geolocation */}
              <DeviceLocationMap />

              {/* bottom panels */}
              <div className="grid divide-border md:grid-cols-4 md:divide-x">
                {/* stats */}
                <div className="grid grid-cols-2 gap-x-4 border-b border-border p-4 md:border-b-0">
                  {stats.map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 + i * 0.08, ease }}
                      className={i > 1 ? "mt-5 border-t border-border pt-4" : ""}
                    >
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className="mt-1 text-2xl font-light">
                        {s.value}
                        {s.suffix && (
                          <span className="ml-1 text-xs text-muted-foreground">{s.suffix}</span>
                        )}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* drones list */}
                <Panel
                  title="Survey Drones"
                  meta={
                    loading ? "…" : `${drones.filter((d) => d.status === "FLYING").length} flying`
                  }
                >
                  {drones.length ? (
                    drones
                      .slice(0, 8)
                      .map((d) => (
                        <Row
                          key={d.id}
                          left={d.name}
                          right={
                            d.status === "FLYING"
                              ? droneStatusText(d.status)
                              : droneStatusText(d.status)
                          }
                          tone={
                            d.status === "FLYING"
                              ? "ok"
                              : d.batteryPercent != null && d.batteryPercent < 30
                                ? "warn"
                                : "muted"
                          }
                        />
                      ))
                  ) : (
                    <EmptyRow text={loading ? "Loading drones…" : "No drones registered"} />
                  )}
                </Panel>

                {/* routes */}
                <Panel
                  title="Recent Inspections"
                  meta={loading ? "…" : `${recentInspections.length} recorded`}
                >
                  {recentInspections.length ? (
                    recentInspections
                      .slice(0, 6)
                      .map((r) => (
                        <Row
                          key={r.id}
                          left={r.legacyId ?? shortId(r.id)}
                          right={inspectionStatus(r.status)}
                          tone={inspectionTone(r.status)}
                        />
                      ))
                  ) : (
                    <EmptyRow text={loading ? "Loading inspections…" : "No inspections yet"} />
                  )}
                </Panel>

                {/* notifications */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-medium">Notifications</h2>
                    <MoreHorizontal size={14} className="text-muted-foreground" />
                  </div>
                  <ul className="mt-3 space-y-3">
                    {notifications.map((n) => (
                      <li key={n.title} className="flex gap-2">
                        <span
                          className={`mt-0.5 shrink-0 ${
                            n.tone === "ok"
                              ? "text-success"
                              : n.tone === "warn"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          <n.icon size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] leading-snug">{n.title}</p>
                          <p className="text-[10px] text-muted-foreground">{n.body}</p>
                        </div>
                        {n.time && (
                          <span className="shrink-0 text-[9px] text-muted-foreground">
                            {n.time}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            optimizing
            <br />
            <span className="text-subtle">road inspection workflows</span>
          </span>
          <span className="flex items-center gap-2">
            ux/ui design <span className="text-subtle">✳</span> by phenomenon
          </span>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border p-4 md:border-b-0">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium">{title}</h2>
        <span className="text-[10px] text-muted-foreground">{meta}</span>
      </div>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}

function Row({ left, right, tone }: { left: string; right: string; tone: string }) {
  return (
    <li className="flex items-center justify-between gap-2 text-[11px]">
      <span className="truncate">{left}</span>
      <span className={`flex shrink-0 items-center gap-1 ${toneClass(tone)}`}>
        <span className="size-1 rounded-full bg-current" />
        {right}
      </span>
    </li>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="py-1 text-[11px] text-muted-foreground">
      <span className="mr-1.5 inline-block size-1 rounded-full bg-border-strong" />
      {text}
    </li>
  );
}
