import { Reveal } from "@/features/event-lp/reveal";

export function Concept() {
  return (
    <section className="elp-section elp-concept" aria-label="コンセプト">
      <div className="elp-inner">
        <Reveal>
          <h2 className="elp-concept-title">NOT JUST KARAOKE.</h2>
          <div className="elp-divider" />
          <p className="elp-concept-body">
            {"ただ歌うだけじゃない。\nただ飲むだけじゃない。\n\nここは、\n人と人がLINKする場所。\n\n歌って。\n笑って。\n乾杯して。\n\nいつもの仲間との時間も、\n初めて出会う誰かとの時間も。\n\n気づけば、"}
          </p>
          <p className="elp-concept-closer">「また会おう」と言える関係になっている。</p>
          <p className="elp-concept-body" style={{ marginTop: 18 }}>
            {"そんな夜を、\nLINKSで。"}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
