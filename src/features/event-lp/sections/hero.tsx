import { ChevronDown } from "lucide-react";
import { eventConfig } from "@/data/eventConfig";

export function Hero() {
  return (
    <section className="elp-hero" aria-label="イベント概要">
      <div className="elp-hero-bg" aria-hidden="true" />
      <div className="elp-hero-grain" aria-hidden="true" />

      <div className="elp-hero-top">
        <p className="elp-hero-kicker">{eventConfig.eventKicker}</p>
      </div>

      <div className="elp-hero-mid">
        <h1 className="elp-hero-brand">{eventConfig.brand}</h1>
        <p className="elp-hero-eventname">{eventConfig.eventName}</p>
        <p className="elp-hero-date">{eventConfig.date.split(".").slice(1).join(".")}</p>
        <p className="elp-hero-datemeta">
          <b>{eventConfig.date.split(".")[0]}</b> {eventConfig.weekday} &middot; {eventConfig.startTime}
          &nbsp;&mdash;&nbsp;{eventConfig.endTime}
        </p>
      </div>

      <div className="elp-hero-bottom">
        <div className="elp-hero-copy">
          <p className="elp-hero-headline">{eventConfig.headline}</p>
          <p className="elp-hero-subheadline">{eventConfig.subheadline}</p>
        </div>

        <a className="elp-cta" href={eventConfig.applicationUrl}>
          {eventConfig.ctaLabel}
        </a>

        <p className="elp-hero-price">
          <strong>{eventConfig.priceLabel}</strong>
          {eventConfig.priceDescription}
        </p>

        <span className="elp-scroll-hint" aria-hidden="true">
          <ChevronDown size={20} />
        </span>
      </div>
    </section>
  );
}
