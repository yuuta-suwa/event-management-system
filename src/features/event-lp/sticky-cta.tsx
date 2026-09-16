"use client";

import { useEffect, useRef, useState } from "react";
import { eventConfig } from "@/data/eventConfig";

export function StickyCta() {
  const [visible, setVisible] = useState(false);
  const heroRef = useRef<Element | null>(null);

  useEffect(() => {
    const hero = document.querySelector(".elp-hero");
    if (!hero) return;
    heroRef.current = hero;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      rootMargin: "0px 0px -85% 0px",
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`elp-sticky ${visible ? "is-visible" : ""}`} aria-hidden={!visible}>
      <p className="elp-sticky-meta">
        <strong>{eventConfig.date}</strong>
        {eventConfig.startTime} START
      </p>
      <a
        className="elp-cta"
        href={eventConfig.applicationUrl}
        tabIndex={visible ? 0 : -1}
      >
        {eventConfig.ctaLabel}
      </a>
    </div>
  );
}
