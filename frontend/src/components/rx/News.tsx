import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

const side = [
  {
    title: "Roadstar AI joins Dronacharya platform",
    body: "We are thrilled to welcome Roadstar AI to the Pothole Detection family. Their expertise in autonomous drone navigation will enhance our road scanning capabilities.",
    date: "July 17, 2024",
  },
  {
    title: "Webinar: Reducing road repair costs with AI detection",
    body: "Join us for an exclusive webinar on how AI-powered pothole detection can cut road maintenance costs by up to 40%. Sign up now to secure your spot!",
    date: "July 7, 2024",
  },
  {
    title: "App update: Enhanced road scan accuracy",
    body: "Our latest mobile app update includes improved pothole detection algorithms with 98.5% accuracy. View and annotate road scans even offline. Update today!",
    date: "July 2, 2024",
  },
];

export function News() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <motion.article
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.9, ease }}
          className="flex flex-col"
        >
          <h2 className="display text-4xl md:text-[3.25rem]">
            New feature release: AI-powered damage estimation
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-subtle">
            We're excited to announce the release of our new AI-powered damage estimation feature,
            providing instant repair cost calculations based on pothole size, depth, and location
            to streamline your road maintenance budgeting.
          </p>
          <div className="mt-16 flex items-center gap-10 md:mt-auto md:pt-24">
            <span className="text-xs text-subtle">            August 6, 2024</span>
            <button className="text-xs font-medium transition-opacity hover:opacity-70">
              Read more
            </button>
          </div>
          <button className="mt-16 self-start text-xs font-medium transition-opacity hover:opacity-70 md:mt-24">
            View all news
          </button>
        </motion.article>

        <div className="flex flex-col md:border-l md:border-border md:pl-16">
          {side.map((n, i) => (
            <motion.article
              key={n.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.8, delay: i * 0.1, ease }}
              className={`py-8 ${i > 0 ? "border-t border-border" : "md:pt-0"}`}
            >
              <h3 className="text-xl leading-snug">{n.title}</h3>
              <p className="mt-3 text-xs leading-relaxed text-subtle">{n.body}</p>
              <div className="mt-6 flex items-center gap-10">
                <span className="text-xs text-subtle">{n.date}</span>
                <button className="text-xs font-medium transition-opacity hover:opacity-70">
                  Read more
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
