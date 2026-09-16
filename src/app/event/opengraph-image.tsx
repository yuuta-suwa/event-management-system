import { ImageResponse } from "next/og";
import { eventConfig } from "@/data/eventConfig";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = eventConfig.ogTitle;

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0b0b0d 0%, #050505 60%, #08090b 100%)",
          color: "#f4efe4",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 10, color: "#d4af7a" }}>
          KARAOKE EVENT
        </div>
        <div style={{ display: "flex", fontSize: 120, fontWeight: 700, marginTop: 24, color: "#e9d3a8" }}>
          LINKS BAR
        </div>
        <div style={{ display: "flex", fontSize: 46, letterSpacing: 14, marginTop: 18 }}>
          {eventConfig.eventName}
        </div>
        <div style={{ display: "flex", fontSize: 34, marginTop: 34, color: "#cfc8ba" }}>
          {eventConfig.date} {eventConfig.weekday} &nbsp;&nbsp;{eventConfig.startTime}
          &mdash;{eventConfig.endTime}
        </div>
      </div>
    ),
    { ...size },
  );
}
