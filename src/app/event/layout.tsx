import { Playfair_Display } from "next/font/google";
import "./event-lp.css";

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-elp-display",
});

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <div className={`elp-root ${display.variable}`}>{children}</div>;
}
