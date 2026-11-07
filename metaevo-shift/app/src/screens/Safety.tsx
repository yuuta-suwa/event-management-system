import { Sheet } from '../ui/kit';

/** R_SAFE：行動改善を中断し、現地の緊急支援を案内（医療診断はしない） */
export function SafetySheet(props: { onClose: () => void }) {
  return (
    <Sheet title="安全を最優先にしてください" eyebrow="安全・支援" onClose={props.onClose} testId="safety-sheet">
      <p>行動の改善や記録は、いったん止めて構いません。入力も不要です。</p>
      <ul>
        <li>命や身体に危険がある、緊急の対応が必要：<strong>119</strong>（救急・消防）／<strong>110</strong>（警察）</li>
        <li>こころの悩みを相談したい：お住まいの自治体の相談窓口、または「こころの健康相談統一ダイヤル」<strong>0570-064-556</strong>（受付時間は地域により異なります）</li>
        <li>日本国外にいる場合は、その国・地域の緊急番号に連絡してください。</li>
      </ul>
      <p className="small faint">このアプリは医療・診断・心理療法ではありません。状況を判断することもありません。必要なときは専門家の支援を受けてください。</p>
      <button className="btn block" onClick={props.onClose}>閉じる</button>
    </Sheet>
  );
}
