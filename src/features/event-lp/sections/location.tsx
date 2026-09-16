import { MapPin } from "lucide-react";
import { eventConfig } from "@/data/eventConfig";
import { Reveal } from "@/features/event-lp/reveal";

export function Location() {
  return (
    <section className="elp-section elp-location" aria-label="会場">
      <div className="elp-inner">
        <Reveal>
          <p className="elp-eyebrow">Location</p>
          <h2 className="elp-location-venue">{eventConfig.venue}</h2>
          <p className="elp-location-building">
            {eventConfig.building} {eventConfig.floor}
          </p>
          <p className="elp-location-address">
            〒{eventConfig.postalCode}
            <br />
            {eventConfig.address}
          </p>
          {eventConfig.mapUrl && (
            <a className="elp-location-map" href={eventConfig.mapUrl} target="_blank" rel="noreferrer">
              <MapPin size={16} aria-hidden="true" />
              MAPを見る
            </a>
          )}
        </Reveal>
      </div>
    </section>
  );
}
