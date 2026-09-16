import { Banknote, CalendarClock, MapPin, Users } from "lucide-react";
import { eventConfig } from "@/data/eventConfig";
import { Reveal } from "@/features/event-lp/reveal";

export function EventInfo() {
  return (
    <section className="elp-section elp-info" aria-label="イベント情報">
      <div className="elp-inner">
        <Reveal>
          <div className="elp-info-head">
            <p className="elp-eyebrow">Event Info</p>
          </div>

          <div className="elp-info-date">
            <span>
              {eventConfig.date.split(".")[0]} &middot; {eventConfig.weekday}
            </span>
            <strong>{eventConfig.date.split(".").slice(1).join(".")}</strong>
            <span>
              {eventConfig.startTime} &mdash; {eventConfig.endTime}
            </span>
          </div>

          <div className="elp-info-rows">
            <div className="elp-info-row">
              <CalendarClock aria-hidden="true" />
              <div>
                <p className="elp-info-row-label">Venue</p>
                <p className="elp-info-row-value">{eventConfig.venue}</p>
                <p className="elp-info-row-sub">
                  {eventConfig.building} {eventConfig.floor}
                </p>
              </div>
            </div>

            <div className="elp-info-row">
              <MapPin aria-hidden="true" />
              <div>
                <p className="elp-info-row-label">Address</p>
                <p className="elp-info-row-value" style={{ fontSize: 14, fontWeight: 400 }}>
                  〒{eventConfig.postalCode}
                  <br />
                  {eventConfig.address}
                </p>
              </div>
            </div>

            <div className="elp-info-row">
              <Banknote aria-hidden="true" />
              <div>
                <p className="elp-info-row-label">Price</p>
                <p className="elp-info-row-value">{eventConfig.priceLabel}</p>
                <p className="elp-info-row-sub">{eventConfig.priceDescription}</p>
              </div>
            </div>

            <div className="elp-info-row">
              <Users aria-hidden="true" />
              <div>
                <p className="elp-info-row-label">Capacity</p>
                <p className="elp-info-row-value">{eventConfig.capacity}</p>
              </div>
            </div>
          </div>

          <div className="elp-info-cta">
            <a className="elp-cta" href={eventConfig.applicationUrl}>
              {eventConfig.ctaLabel}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
