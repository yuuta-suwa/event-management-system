/**
 * LINKS BAR event landing page — single source of truth.
 *
 * To publish the next event: update the values below (and swap
 * heroImage / ogImage if you have real photos), then redeploy.
 * See README.md "次回イベント更新方法" for the full checklist.
 */
export const eventConfig = {
  brand: "LINKS BAR",
  brandTagline: "GOOD PEOPLE. GOOD MUSIC. GREAT NIGHT.",
  eventName: "KARAOKE NIGHT",
  eventKicker: "Karaoke Event",

  date: "2026.09.23",
  dateLong: "2026年9月23日",
  weekday: "WED",
  weekdayJa: "水",

  startTime: "21:00",
  endTime: "23:00",

  venue: "LINKS BAR",
  building: "東和住吉ビル北館",
  floor: "4F",

  postalCode: "460-0008",
  address: "愛知県名古屋市中区栄3丁目9-1",

  price: 4000,
  priceLabel: "¥4,000",
  priceDescription: "歌い放題・飲み放題",

  capacity: "約50名",

  applicationUrl:
    "https://event-management-system-gmpdcasp.vercel.app/apply/cmu2tshw10001jk04qxgmc2gw",

  ctaLabel: "この夜に参加する",

  // Set once a real map link exists. Leave empty to hide the "MAPを見る" link.
  mapUrl: "",

  // Optional real photography. Leave empty to use the built-in
  // cinematic CSS design (gradients / light / bokeh, no stock photos).
  heroImage: "",
  heroImageAlt: "",

  headline: "人と人がLINKする、\n特別な一夜。",
  subheadline: "歌って、\n笑って、\n乾杯して。\n\nいつもの仲間も。\n初めましての人も。",

  ogTitle: "9.23 KARAOKE NIGHT | LINKS BAR",
  ogDescription: "人と人がLINKする、特別な一夜。\n9月23日、歌って、笑って、乾杯して。",
} as const;

export type EventConfig = typeof eventConfig;
