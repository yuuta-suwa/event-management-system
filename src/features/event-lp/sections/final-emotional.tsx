import { eventConfig } from "@/data/eventConfig";
import { Reveal } from "@/features/event-lp/reveal";

export function FinalEmotional() {
  return (
    <section className="elp-section elp-final-emotional" aria-label="夜への招待">
      <div className="elp-inner">
        <Reveal>
          <h2 className="elp-final-emotional-title">
            GOOD PEOPLE.
            <br />
            GOOD MUSIC.
            <br />
            GREAT NIGHT.
          </h2>
          <p className="elp-final-emotional-body">
            {"楽しかった夜は、\nいつか思い出になる。\n\nでも、\n\nそこで生まれたつながりは、\nその先にも続いていく。"}
          </p>
          <p className="elp-final-emotional-date">{eventConfig.date}</p>
          <p className="elp-final-emotional-body" style={{ marginTop: 18 }}>
            {"歌って、\n笑って、\n乾杯して。\n\nまたひとつ、\n忘れられない夜を。"}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
