import {describe,expect,it} from "vitest";
import {decideExitGate,exitReasonLabel,normalizeExitReason,EXIT_NOTE_MAX} from "@/features/checkins/exit-domain";
describe("退出の理由と判定",()=>{
  it("理由コードは既定の6種類だけ。未知のコードは拒否する",()=>{
    expect(normalizeExitReason("LEAVE")).toEqual({ok:true,code:"LEAVE",note:null});
    expect(normalizeExitReason("ILL","  頭痛  ")).toEqual({ok:true,code:"ILL",note:"頭痛"});
    expect(normalizeExitReason("HACK").ok).toBe(false);
    expect(normalizeExitReason("").ok).toBe(false);
  });
  it("「その他」だけは理由メモが必須。メモは全角を揃え、長すぎる分は切る",()=>{
    expect(normalizeExitReason("OTHER").ok).toBe(false);
    expect(normalizeExitReason("OTHER","   ").ok).toBe(false);
    const r=normalizeExitReason("OTHER","ＡＢＣ".repeat(200));
    expect(r.ok&&r.note).toBe("ABC".repeat(200).slice(0,EXIT_NOTE_MAX));
  });
  it("理由コードを日本語の表示名にする(未知はそのまま)",()=>{
    expect(exitReasonLabel("TEMPORARY")).toBe("一時退出（再入場予定）");
    expect(exitReasonLabel("???")).toBe("???");
  });
  it("退出できるのは、受付済みで、まだ退出していない人だけ",()=>{
    const base={valid:true,sameEvent:true,hasCheckin:true,exited:false};
    expect(decideExitGate(base)).toBe("PROCEED");
    expect(decideExitGate({...base,valid:false})).toBe("INVALID");
    expect(decideExitGate({...base,sameEvent:false})).toBe("WRONG_EVENT");
    expect(decideExitGate({...base,hasCheckin:false})).toBe("NOT_CHECKED_IN");
    expect(decideExitGate({...base,exited:true})).toBe("ALREADY_EXITED");
  });
});
