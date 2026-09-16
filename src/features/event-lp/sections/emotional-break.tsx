import { Reveal } from "@/features/event-lp/reveal";

export function EmotionalBreak() {
  return (
    <section className="elp-section elp-emotional" aria-label="MUSIC CONNECTS US">
      <div className="elp-inner">
        <Reveal>
          <h2 className="elp-emotional-title">
            MUSIC
            <br />
            CONNECTS
            <br />
            US.
          </h2>
          <p className="elp-emotional-body">
            {"歌がきっかけで、\n知らなかった誰かが、\nまた会いたい人になる。"}
          </p>
          <p className="elp-emotional-quote">「今日、来てよかった。」</p>
          <p className="elp-emotional-body" style={{ marginTop: 14 }}>
            そう思える夜を。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
