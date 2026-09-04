import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/rx/AppNav";
import { Hero } from "@/components/rx/Hero";
import { Features } from "@/components/rx/Features";
import { MobileSection } from "@/components/rx/MobileSection";
import { Capabilities } from "@/components/rx/Capabilities";
import { Partners } from "@/components/rx/Partners";
import { News } from "@/components/rx/News";
import { Footer } from "@/components/rx/Footer";

const title = "Dronacharya — AI Pothole Detection & Repair Estimation";
const description =
  "AI-powered pothole detection from drones with instant repair cost estimation for road infrastructure.";

export const Route = createFileRoute("/")({
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
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main>
        <Hero />
        <Features />
        <MobileSection />
        <Capabilities />
        <Partners />
        <News />
      </main>
      <Footer />
    </div>
  );
}
