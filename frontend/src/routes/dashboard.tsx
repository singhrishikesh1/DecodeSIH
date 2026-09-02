import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import {
  LayoutGrid,
  Route as RouteIcon,
  Bell,
  Search,
  Settings,
  BarChart3,
  Layers,
  Plus,
  Minus,
  Maximize,
  Compass,
  MoreHorizontal,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Package,
  LogOut,
  MapPin,
  Satellite,
} from "lucide-react";
import cityMap from "@/assets/city-map.jpg";

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
  { icon: Satellite, to: "/tracking" as const, label: "GPS Tracking" },
  { icon: MapPin, to: "/cost-estimator" as const, label: "Cost Estimator" },
  { icon: Layers, to: "/dashboard" as const, label: "Layers" },
  { icon: BarChart3, to: "/dashboard" as const, label: "Analytics" },
  { icon: Settings, to: "/dashboard" as const, label: "Settings" },
];

const layers = ["View all", "Aerial", "Road damage", "Weather", "Survey drones", "No-Fly zones"];

const stats = [
  { label: "Active Survey Drones", value: "28", suffix: "/34" },
  { label: "Potholes Detected", value: "14" },
  { label: "Avg. Scan Time", value: "18.4", suffix: "min" },
  { label: "Detection Accuracy", value: "96.2", suffix: "%" },
];

const drones = [
  { id: "SR-1149-4579", status: "Scanning", tone: "muted" },
  { id: "SR-0968-1593", status: "Scanning", tone: "muted" },
  { id: "SR-4367-1665", status: "Deviation", tone: "warn" },
  { id: "SR-0238-3464", status: "Idle", tone: "muted" },
];

const routes = [
  { id: "INS-4470", status: "On time", tone: "muted" },
  { id: "INS-4468", status: "+4 min", tone: "warn" },
  { id: "INS-4462", status: "Complete", tone: "ok" },
  { id: "INS-4459", status: "On time", tone: "muted" },
];

const notifications = [
  {
    icon: CheckCircle2,
    tone: "ok" as const,
    title: "SR-076 severe pothole found on Hwy 101",
    body: "Depth: 15cm — auto-flagged for repair",
    time: "11:00 AM",
  },
  {
    icon: AlertTriangle,
    tone: "warn" as const,
    title: "SR-121 battery below threshold",
    body: "Rerouting to nearest charging station CP-02",
    time: "10:20 AM",
  },
  {
    icon: Package,
    tone: "muted" as const,
    title: "Scan INS-4462 completed — 7 potholes found",
    body: "Repair estimate: ₹34,200",
    time: "8:30 AM",
  },
];

const droneMarkers = [
  { top: "26%", left: "22%", label: "AD 1140-1245", delay: 0 },
  { top: "44%", left: "12%", label: "AD 1149-4579", delay: 0.6 },
  { top: "22%", left: "72%", label: "AD-4575-4098", delay: 1.2 },
];

const alerts = [
  { top: "58%", left: "34%" },
  { top: "38%", left: "52%" },
  { top: "50%", left: "74%" },
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

function Dashboard() {
  const [layer, setLayer] = useState(0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-10">
        {/* frame labels, like the reference deck */}
        <div className="mb-4 flex items-center justify-between text-[11px] text-muted-foreground">              <span>
            pothole <span className="text-subtle">detection</span>
          </span>
          <span className="text-right">
            real-time
            <br />
            monitoring
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_-40px_rgba(20,25,40,0.25)]"
        >
          {/* top bar */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DroneGlyph size={18} />
            </span>
            <h1 className="text-lg font-medium">Overview</h1>

            <div className="mx-auto hidden w-full max-w-md items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground md:flex">
              <Search size={14} />
              <span>Search potholes, road sections, surveys...</span>
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <button className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground">
                <Radio size={14} />
              </button>
              <button className="relative flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground">
                <Bell size={14} />
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />
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
              <span className="mt-2 text-[9px] text-subtle">PH-1593</span>
            </div>

            <div className="min-w-0 flex-1">
              {/* map */}
              <div className="relative h-[300px] overflow-hidden border-b border-border md:h-[430px]">
                <img
                  src={cityMap}
                  width={1600}
                  height={1008}                    alt="Isometric city map of the active road scanning zone"
                  className="size-full object-cover"
                />

                {/* no-fly hatch zones */}
                {alerts.map((a, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.4 + i * 0.15, ease }}
                    style={{ top: a.top, left: a.left }}
                    className="absolute -translate-x-1/2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm bg-destructive/15">
                      <AlertTriangle size={13} className="text-destructive" />
                    </div>
                    <div className="mt-0.5 h-1.5 w-16 -translate-x-1/4 rotate-[18deg] bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--destructive)_45%,transparent)_0_3px,transparent_3px_6px)]" />
                  </motion.div>
                ))}

                {/* drones */}
                {droneMarkers.map((d) => (
                  <motion.div
                    key={d.label}
                    style={{ top: d.top, left: d.left }}
                    className="absolute"
                    animate={{ y: [0, -7, 0] }}
                    transition={{
                      duration: 3.4,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: d.delay,
                    }}
                  >
                    <span className="absolute -top-4 left-0 whitespace-nowrap text-[9px] text-muted-foreground">
                      {d.label}
                    </span>
                    <DroneGlyph />
                  </motion.div>
                ))}

                {/* layers panel */}
                <div className="absolute top-4 right-4 w-36 rounded-xl border border-border bg-card/95 p-1.5 backdrop-blur">
                  {layers.map((l, i) => (
                    <button
                      key={l}
                      onClick={() => setLayer(i)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-elevated"
                    >
                      <span
                        className={`size-2 rounded-full border ${
                          i === layer ? "border-primary bg-primary" : "border-border-strong"
                        }`}
                      />
                      <span className={i === layer ? "font-medium" : "text-muted-foreground"}>
                        {l}
                      </span>
                    </button>
                  ))}
                </div>

                {/* zoom controls */}
                <div className="absolute right-4 bottom-4 flex flex-col gap-1.5">
                  {[Plus, Minus, Maximize, Compass].map((Icon, i) => (
                    <button
                      key={i}
                      className={`flex size-7 items-center justify-center rounded-lg border border-border transition-colors ${
                        i === 3
                          ? "bg-foreground text-background"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </div>
              </div>

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
                <Panel title="Survey Drones" meta="26 online">
                  {drones.map((d) => (
                    <Row key={d.id} left={d.id} right={d.status} tone={d.tone} />
                  ))}
                </Panel>

                {/* routes */}
                <Panel title="Active Inspections" meta="6 today">
                  {routes.map((r) => (
                    <Row key={r.id} left={r.id} right={r.status} tone={r.tone} />
                  ))}
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
                        <span className="shrink-0 text-[9px] text-muted-foreground">{n.time}</span>
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
