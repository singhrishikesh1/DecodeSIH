import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { Nav } from "@/components/rx/Nav";
import { Footer } from "@/components/rx/Footer";
import {
  ArrowLeft,
  Battery,
  Compass,
  MapPin,
  Maximize,
  Minus,
  Plus,
  Radio,
  Signal,
  Gauge,
  Clock,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const title = "GPS Drone Tracking — RX Pothole Detection";
const description =
  "Live GPS tracking of survey drones scanning roads for potholes. Real-time position, flight paths, and mission status.";

export const Route = createFileRoute("/tracking")({
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
  component: Tracking,
});

const ease = [0.16, 1, 0.3, 1] as const;

type DroneData = {
  id: string;
  name: string;
  status: "scanning" | "returning" | "idle" | "charging";
  battery: number;
  speed: string;
  altitude: string;
  lat: string;
  lng: string;
  heading: string;
  mission: string;
  distanceScanned: string;
  potholesFound: number;
};

const drones: DroneData[] = [
  {
    id: "SR-4579",
    name: "Sentinel Alpha",
    status: "scanning",
    battery: 78,
    speed: "12.4 km/h",
    altitude: "45m",
    lat: "34.0522° N",
    lng: "118.2437° W",
    heading: "NE 42°",
    mission: "Hwy 101 — Seg B",
    distanceScanned: "3.2 km",
    potholesFound: 7,
  },
  {
    id: "SR-1593",
    name: "Sentinel Beta",
    status: "scanning",
    battery: 62,
    speed: "11.8 km/h",
    altitude: "40m",
    lat: "34.0580° N",
    lng: "118.2510° W",
    heading: "SE 128°",
    mission: "Main St — Downtown",
    distanceScanned: "1.8 km",
    potholesFound: 3,
  },
  {
    id: "SR-1665",
    name: "Sentinel Gamma",
    status: "returning",
    battery: 23,
    speed: "15.2 km/h",
    altitude: "50m",
    lat: "34.0490° N",
    lng: "118.2380° W",
    heading: "NW 315°",
    mission: "Industrial Blvd",
    distanceScanned: "5.1 km",
    potholesFound: 12,
  },
  {
    id: "SR-3464",
    name: "Sentinel Delta",
    status: "charging",
    battery: 15,
    speed: "0 km/h",
    altitude: "0m",
    lat: "34.0445° N",
    lng: "118.2400° W",
    heading: "—",
    mission: "Standby",
    distanceScanned: "0 km",
    potholesFound: 0,
  },
];

const flightPaths = [
  { drone: "SR-4579", color: "var(--primary)", points: "20,40 35,35 55,42 72,38 88,45" },
  { drone: "SR-1593", color: "var(--success)", points: "15,65 30,58 48,62 65,55 82,60" },
  { drone: "SR-1665", color: "var(--destructive)", points: "80,30 65,38 50,32 35,40 25,35" },
];

const mapAlerts = [
  { top: "30%", left: "42%", depth: "12cm", severity: "Severe" },
  { top: "55%", left: "28%", depth: "5cm", severity: "Moderate" },
  { top: "45%", left: "68%", depth: "18cm", severity: "Critical" },
  { top: "65%", left: "52%", depth: "3cm", severity: "Minor" },
  { top: "38%", left: "78%", depth: "9cm", severity: "Severe" },
];

const statusColors: Record<string, string> = {
  scanning: "text-success",
  returning: "text-primary",
  idle: "text-subtle",
  charging: "text-destructive",
};

const statusBg: Record<string, string> = {
  scanning: "bg-success/15",
  returning: "bg-primary/15",
  idle: "bg-elevated",
  charging: "bg-destructive/15",
};

function Tracking() {
  const [selectedDrone, setSelectedDrone] = useState(0);
  const [simTime, setSimTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSimTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const drone = drones[selectedDrone];
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

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
              GPS Drone
              <br />
              <span className="text-primary">Live Tracking</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-subtle">
              Real-time GPS positions of all survey drones. Monitor flight paths, battery levels, and detected potholes as they happen.
            </p>
          </motion.div>
        </section>

        {/* Map + Sidebar */}
        <section className="mx-auto max-w-[1400px] px-5 md:px-8">
          <div className="mt-14 grid gap-6 md:grid-cols-[1fr_340px]">
            {/* Map Area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease }}
              className="card-panel relative overflow-hidden"
            >
              {/* SVG Map */}
              <div className="relative h-[400px] bg-gradient-to-br from-[oklch(0.18_0.002_264)] to-[oklch(0.14_0.003_264)] md:h-[520px]">
                {/* Grid overlay */}
                <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />

                {/* Road grid */}
                <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full opacity-20">
                  {/* Horizontal roads */}
                  {[20, 35, 50, 65].map((y) => (
                    <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="var(--subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
                  ))}
                  {/* Vertical roads */}
                  {[15, 30, 50, 70, 85].map((x) => (
                    <line key={`v${x}`} x1={x} y1="0" x2={x} y2="80" stroke="var(--subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
                  ))}
                  {/* Major highway */}
                  <line x1="0" y1="40" x2="100" y2="38" stroke="var(--primary)" strokeWidth="1.5" opacity="0.3" />
                </svg>

                {/* Flight paths */}
                <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full">
                  {flightPaths.map((fp) => (
                    <motion.polyline
                      key={fp.drone}
                      points={fp.points}
                      fill="none"
                      stroke={fp.color}
                      strokeWidth="0.8"
                      strokeDasharray="3,2"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.6 }}
                      transition={{ duration: 2, ease }}
                    />
                  ))}
                </svg>

                {/* Drone markers */}
                {[
                  { top: "38%", left: "72%", drone: 0 },
                  { top: "55%", left: "48%", drone: 1 },
                  { top: "32%", left: "25%", drone: 2 },
                ].map((pos, i) => (
                  <motion.div
                    key={i}
                    style={{ top: pos.top, left: pos.left }}
                    className={`absolute -translate-x-1/2 cursor-pointer ${selectedDrone === pos.drone ? "z-10" : "z-0"}`}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
                    onClick={() => setSelectedDrone(pos.drone)}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-full border-2 ${
                        selectedDrone === pos.drone
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      <Radio size={14} />
                    </div>
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-foreground">
                      {drones[pos.drone].id}
                    </span>
                  </motion.div>
                ))}

                {/* Pothole markers */}
                {mapAlerts.map((a, i) => (
                  <motion.div
                    key={i}
                    style={{ top: a.top, left: a.left }}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5, delay: 1 + i * 0.15, ease }}
                  >
                    <div
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        a.severity === "Critical"
                          ? "bg-destructive/20 text-destructive"
                          : a.severity === "Severe"
                          ? "bg-primary/20 text-primary"
                          : "bg-elevated text-subtle"
                      }`}
                    >
                      <MapPin size={10} />
                      {a.depth}
                    </div>
                  </motion.div>
                ))}

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

                {/* Live indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 backdrop-blur">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  <span className="text-[11px] font-medium">LIVE</span>
                  <span className="text-[10px] text-subtle">{formatTime(simTime)}</span>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <div className="flex items-center gap-4 text-xs text-subtle">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-success" /> Scanning
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-primary" /> Returning
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-destructive" /> Low battery
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={10} className="text-primary" /> Pothole found
                  </span>
                </div>
                <span className="text-[10px] text-subtle">Updated 2s ago</span>
              </div>
            </motion.div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Drone list */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease }}
                className="card-panel overflow-hidden"
              >
                <div className="border-b border-border p-4">
                  <h3 className="text-sm font-medium">Survey Drones</h3>
                  <p className="text-[11px] text-subtle">{drones.filter((d) => d.status === "scanning").length} active • {drones.length} total</p>
                </div>
                <div className="divide-y divide-border">
                  {drones.map((d, i) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDrone(i)}
                      className={`flex w-full items-center gap-3 p-4 text-left transition-colors ${
                        i === selectedDrone ? "bg-primary/5" : "hover:bg-elevated/50"
                      }`}
                    >
                      <div className={`flex size-8 items-center justify-center rounded-full ${statusBg[d.status]}`}>
                        <Radio size={14} className={statusColors[d.status]} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{d.name}</p>
                        <p className="text-[10px] text-subtle">{d.id} • {d.mission}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[10px] capitalize ${statusColors[d.status]}`}>{d.status}</p>
                        <p className="text-[10px] text-subtle">{d.battery}%</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Selected drone details */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease }}
                className="card-panel overflow-hidden"
              >
                <div className="border-b border-border p-4">
                  <h3 className="text-sm font-medium">{drone.name}</h3>
                  <p className="text-[11px] text-subtle">Mission: {drone.mission}</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border">
                  {[
                    { icon: Battery, label: "Battery", value: `${drone.battery}%`, color: drone.battery < 30 ? "text-destructive" : "text-foreground" },
                    { icon: Gauge, label: "Speed", value: drone.speed, color: "text-foreground" },
                    { icon: Compass, label: "Altitude", value: drone.altitude, color: "text-foreground" },
                    { icon: Signal, label: "Heading", value: drone.heading, color: "text-foreground" },
                    { icon: MapPin, label: "Lat/Lng", value: drone.lat, color: "text-foreground" },
                    { icon: Clock, label: "Scanned", value: drone.distanceScanned, color: "text-foreground" },
                  ].map((item) => (
                    <div key={item.label} className="bg-card p-3">
                      <p className="flex items-center gap-1 text-[10px] text-subtle">
                        <item.icon size={10} />
                        {item.label}
                      </p>
                      <p className={`mt-0.5 text-sm font-medium ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-subtle">Potholes found</span>
                    <span className="display text-lg text-primary">{drone.potholesFound}</span>
                  </div>
                </div>
              </motion.div>

              {/* Quick alerts */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease }}
                className="card-panel p-4"
              >
                <h3 className="text-xs font-medium">Recent Detections</h3>
                <div className="mt-3 space-y-2.5">
                  {[
                    { icon: AlertTriangle, tone: "text-destructive", text: "Critical: 18cm pothole on Hwy 101", time: "2m ago" },
                    { icon: CheckCircle2, tone: "text-success", text: "Scan complete: Main St segment", time: "8m ago" },
                    { icon: AlertTriangle, tone: "text-primary", text: "Severe: 12cm pothole found", time: "14m ago" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <a.icon size={12} className={`mt-0.5 shrink-0 ${a.tone}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] leading-snug">{a.text}</p>
                        <p className="text-[10px] text-subtle">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
