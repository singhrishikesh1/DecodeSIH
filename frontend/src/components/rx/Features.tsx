import { motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as const;

const reveal = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0 },
};

function Dots() {
  return (
    <span className="inline-flex items-center rounded-full bg-elevated px-2 py-1 text-subtle">
      <MoreHorizontal size={14} />
    </span>
  );
}

function TemperatureMock() {
  return (
    <div className="relative mt-10 flex items-end gap-4 md:mt-14">
      <div className="w-[52%] shrink-0 rounded-t-xl border border-b-0 border-accent/45 bg-gradient-to-b from-accent/12 to-transparent p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-accent-dim">Pothole Depth</span>
          <span className="inline-flex items-center rounded-full bg-accent/25 px-2 py-0.5 text-accent">
            <MoreHorizontal size={14} />
          </span>
        </div>
        <div className="display mt-4 flex items-start text-[3.5rem] leading-none text-accent-dim">
          12<span className="mt-1 text-2xl">cm</span>
        </div>
        <p className="mt-3 text-[11px] leading-tight text-accent-dim/50">
          Average pothole depth
          <br />
          in surveyed section
        </p>
      </div>

      <div className="flex-1 rounded-t-xl border border-b-0 border-border bg-elevated/60 p-4">
        <p className="text-[11px] text-subtle">Road section</p>
        <p className="mt-0.5 text-sm">Highway 101 — Segment B</p>
        <div className="mt-4 flex gap-8 border-t border-border pt-3">
          <div>
            <p className="text-[11px] text-subtle">Last scan</p>
            <p className="mt-0.5 text-sm">Today, 8:00</p>
          </div>
          <div>
            <p className="text-[11px] text-subtle">Length</p>
            <p className="mt-0.5 text-sm">
              3.2 <span className="text-subtle">km</span>
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border py-2.5 text-center text-sm text-subtle">
          Updating
        </div>
      </div>
    </div>
  );
}

const bars = [18, 26, 14, 34, 22, 44, 96, 70, 52, 38, 60, 30, 20, 12, 28, 16];
const times = ["7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM"];

function MoistureMock() {
  return (
    <div className="mt-10 rounded-t-xl border border-b-0 border-border bg-elevated/50 p-4 md:mt-14">
      <div className="flex items-center justify-between">
        <span className="text-sm">Road Damage Index</span>
        <Dots />
      </div>
      <div className="mt-4 grid grid-cols-7 border-t border-border">
        {times.map((t, i) => (
          <div
            key={t}
            className={`px-1 pt-2 text-[10px] leading-tight ${
              i === 2 ? "border-l border-border-strong text-foreground" : "text-subtle/70"
            }`}
          >
            {t.replace(" ", "\n")}
          </div>
        ))}
      </div>
      <div className="mt-6 flex h-24 items-end gap-1">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: i * 0.03, ease }}
            className={`flex-1 rounded-sm ${i >= 6 && i <= 9 ? "bg-foreground/45" : "bg-foreground/12"}`}
          />
        ))}
      </div>
    </div>
  );
}

function MapMock() {
  return (
    <div className="mt-10 h-40 overflow-hidden rounded-t-xl border border-b-0 border-border bg-elevated/40 md:mt-14">
      <svg viewBox="0 0 400 160" className="h-full w-full">
        <defs>
          <linearGradient id="parcel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.855 0.135 89 / 0.35)" />
            <stop offset="100%" stopColor="oklch(0.855 0.135 89 / 0.05)" />
          </linearGradient>
        </defs>
        {Array.from({ length: 9 }).map((_, i) => (
          <line
            key={i}
            x1={i * 50}
            y1="0"
            x2={i * 50 - 40}
            y2="160"
            stroke="oklch(1 0 0 / 0.06)"
          />
        ))}
        <motion.path
          d="M120 26 L250 44 L282 108 L196 148 L112 116 Z"
          fill="url(#parcel)"
          stroke="oklch(0.855 0.135 89 / 0.6)"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease }}
        />
      </svg>
    </div>
  );
}

function IntegrationMock() {
  return (
    <div className="mt-10 grid grid-cols-3 gap-2 md:mt-14">
      {["Soil API", "Weather", "ERP sync", "Fleet", "Yield", "Export"].map((label, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.06, ease }}
          className="rounded-lg border border-border bg-elevated/40 px-3 py-4 text-xs text-subtle"
        >
          {label}
        </motion.div>
      ))}
    </div>
  );
}

const cards = [
  {
    title: "Real-Time Detection",
    body: "Receive up-to-date pothole depth measurements and road condition data.",
    active: true,
    mock: <TemperatureMock />,
  },
  {
    title: "Damage Assessment",
    body: "Track pothole severity, surface area, and estimated repair costs automatically.",
    mock: <MoistureMock />,
  },
  {
    title: "Interactive Road Map",
    body: "Visualize detected potholes on an interactive map with severity indicators.",
    mock: <MapMock />,
  },
  {
    title: "Municipal Integration",
    body: "Sync with city road management systems for automated repair scheduling.",
    mock: <IntegrationMock />,
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-8 md:py-32">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="text-center"
      >
        <motion.h2
          variants={reveal}
          transition={{ duration: 0.9, ease }}
          className="display text-balance-tight mx-auto max-w-4xl text-4xl md:text-[4.25rem]"
        >
          Powerful features for intelligent road inspection
        </motion.h2>
        <motion.p
          variants={reveal}
          transition={{ duration: 0.9, delay: 0.12, ease }}
          className="mt-5 text-base text-subtle"
        >
          Revolutionize your infrastructure maintenance
        </motion.p>
      </motion.div>

      <div className="mt-14 grid gap-4 md:mt-20 md:grid-cols-2">
        {cards.map((c, i) => (
          <motion.article
            key={c.title}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: (i % 2) * 0.1, ease }}
            className={`relative flex flex-col overflow-hidden p-6 pb-0 md:p-8 md:pb-0 ${
              c.active ? "card-panel-active" : "card-panel"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-medium">{c.title}</h3>
              {c.active && (
                <button className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform hover:-translate-y-0.5">
                  View more
                </button>
              )}
            </div>
            <p className="mt-3 max-w-[19rem] text-sm leading-relaxed text-subtle">{c.body}</p>
            {c.mock}
          </motion.article>
        ))}
      </div>
    </section>
  );
}
