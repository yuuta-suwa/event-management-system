import { eventConfig } from "@/data/eventConfig";
import { Reveal } from "@/features/event-lp/reveal";

export function FinalCta() {
  return (
    <section className="elp-section elp-final" aria-label="参加する">
      <div className="elp-inner">
        <Reveal>
          <div className="elp-final-panel">
            <p className="elp-hero-datemeta" style={{ justifyContent: "center" }}>
              <b>{eventConfig.date.split(".")[0]}</b> {eventConfig.weekday}
            </p>
            <p className="elp-hero-date">{eventConfig.date.split(".").slice(1).join(".")}</p>
            <p className="elp-hero-datemeta" style={{ justifyContent: "center" }}>
              {eventConfig.startTime} &mdash; {eventConfig.endTime}
            </p>
            <p className="elp-hero-eventname">
              {eventConfig.venue}
              <br />
              {eventConfig.eventName}
            </p>
            <p className="elp-hero-price" style={{ justifyItems: "center", marginTop: 22 }}>
              <strong>{eventConfig.priceLabel}</strong>
              {eventConfig.priceDescription}
            </p>
            <p className="elp-hero-price" style={{ justifyItems: "center", marginBottom: 26 }}>
              {eventConfig.capacity}
            </p>
            <a className="elp-cta" href={eventConfig.applicationUrl}>
              {eventConfig.ctaLabel}
            </a>
          </div>

          <div className="elp-final-footer">
            <strong>{eventConfig.brand}</strong>
            <span>PEOPLE CONNECT PEOPLE.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
