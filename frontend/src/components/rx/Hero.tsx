import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import droneHero from "@/assets/drone-hero.jpg";

const stats = [
  { value: "47,820+", label: "Potholes detected" },
  { value: "12,640+", label: "Miles surveyed" },
  { value: "$28.5M", label: "Repair costs estimated" },
];

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-24 md:pb-24">
      {/* perspective grid */}
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />

      {/* drone */}
      <motion.img
        src={droneHero}
        width={1600}
        height={1104}
        alt="Matte black road survey drone"
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.6, ease }}
        className="pointer-events-none absolute top-[26%] left-1/2 w-[150%] max-w-none -translate-x-1/2 mix-blend-lighten select-none md:top-[18%] md:w-[76%]"
      />

      <div className="relative mx-auto max-w-[1400px] px-5 md:px-8">
        <motion.h1
          initial="hidden"
          animate="show"
          className="display text-balance-tight text-[3.25rem] leading-[0.95] sm:text-7xl md:text-[5.75rem] lg:text-[7.25rem] xl:text-[8.5rem]"
        >
          {["We detect &", "repair potholes"].map((line, i) => (
            <motion.span
              key={line}
              variants={{
                hidden: { opacity: 0, y: 40 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 1, delay: 0.15 + i * 0.12, ease }}
              className={`block whitespace-nowrap ${i === 1 ? "md:pl-[8%]" : ""}`}
            >
              {line}
            </motion.span>
          ))}
        </motion.h1>

        <div className="mt-10 grid gap-14 md:mt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5, ease }}
            className="md:pl-[8%]"
          >
            <p className="text-lg leading-snug text-foreground/90">
              AI-powered pothole detection
              <br />
              with instant repair estimates
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/dashboard"
                className="group relative inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 glow-accent"
              >
                Get Started
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <button className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85">
                View Pricing
              </button>
            </div>
          </motion.div>

          <motion.dl
            initial="hidden"
            animate="show"
            className="flex flex-col gap-10 md:gap-24 md:pl-[18%]"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                variants={{ hidden: { opacity: 0, x: 30 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.9, delay: 0.6 + i * 0.15, ease }}
              >
                <dt className="display text-4xl font-light md:text-5xl">{s.value}</dt>
                <dd className="mt-2 text-sm text-subtle">{s.label}</dd>
              </motion.div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="mt-16 grid grid-cols-2 gap-6 text-xs leading-relaxed text-subtle md:mt-28 md:grid-cols-[80px_180px_1fr]"
        >
          <span>V.01.24</span>
          <span>
            Pothole depth
            <br />
            Surface area
            <br />
            Crack width
            <br />
            Road condition
            <br />
            Severity index
          </span>
          <span>
            Real-time drone scanning
            <br />
            Automated damage assessment:
            <br />
            Interactive road map view
          </span>
        </motion.div>
      </div>
    </section>
  );
}
