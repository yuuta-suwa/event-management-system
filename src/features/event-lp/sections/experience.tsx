import { Link2, Mic2, Wine } from "lucide-react";
import { Reveal } from "@/features/event-lp/reveal";

const items = [
  {
    index: "01",
    icon: Mic2,
    title: "KARAOKE",
    copy: "好きな歌を、\n好きな仲間と。\n\n音楽が、\n人との距離を縮める。",
  },
  {
    index: "02",
    icon: Wine,
    title: "DRINK",
    copy: "乾杯から始まる、\nいつもより少し特別な時間。\n\n飲み放題。",
  },
  {
    index: "03",
    icon: Link2,
    title: "LINK",
    copy: "今日出会った誰かが、\n次の仲間になる。\n\nここで生まれたつながりが、\nこの夜の先へ続いていく。",
  },
];

export function Experience() {
  return (
    <section className="elp-section elp-experience" aria-label="3つの体験">
      <div className="elp-inner">
        <Reveal>
          <p className="elp-eyebrow">Experience</p>
        </Reveal>
        <div className="elp-experience-list">
          {items.map((item) => (
            <Reveal key={item.index}>
              <article className="elp-experience-item">
                <span className="elp-experience-index" aria-hidden="true">
                  {item.index}
                </span>
                <div className="elp-experience-head">
                  <item.icon aria-hidden="true" />
                  <h3>{item.title}</h3>
                </div>
                <p className="elp-experience-copy">{item.copy}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
