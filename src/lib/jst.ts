const JST_OFFSET = "+09:00";

export function parseJstDateTime(value: string): Date {
  if (!value) return new Date(NaN);
  const hasTime = value.length > 10;
  return new Date(`${value}${hasTime ? "" : "T00:00:00"}${JST_OFFSET}`);
}

export function formatJstDateTimeLocal(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16).replace(" ", "T");
}

export function formatJstDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
