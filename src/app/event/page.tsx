import type { Metadata, Viewport } from "next";
import { eventConfig } from "@/data/eventConfig";
import { Hero } from "@/features/event-lp/sections/hero";
import { Concept } from "@/features/event-lp/sections/concept";
import { Experience } from "@/features/event-lp/sections/experience";
import { EmotionalBreak } from "@/features/event-lp/sections/emotional-break";
import { EventInfo } from "@/features/event-lp/sections/event-info";
import { Location } from "@/features/event-lp/sections/location";
import { FinalEmotional } from "@/features/event-lp/sections/final-emotional";
import { FinalCta } from "@/features/event-lp/sections/final-cta";
import { StickyCta } from "@/features/event-lp/sticky-cta";

export const metadata: Metadata = {
  title: eventConfig.ogTitle,
  description: eventConfig.ogDescription,
  openGraph: {
    title: eventConfig.ogTitle,
    description: eventConfig.ogDescription,
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: eventConfig.ogTitle,
    description: eventConfig.ogDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
};

export default function EventLandingPage() {
  return (
    <>
      <main>
        <Hero />
        <Concept />
        <Experience />
        <EmotionalBreak />
        <EventInfo />
        <Location />
        <FinalEmotional />
        <FinalCta />
      </main>
      <StickyCta />
    </>
  );
}
