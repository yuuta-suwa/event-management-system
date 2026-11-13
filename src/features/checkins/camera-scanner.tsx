"use client";
/* カメラは受付画面を開いている間、起動したままにする(連続受付の高速化)。 */
/* eslint-disable react-hooks/exhaustive-deps */
import {useCallback,useEffect,useRef,useState} from "react";
import type {IScannerControls} from "@zxing/browser";
import {Camera,Keyboard} from "lucide-react";
import {feedback,percentile,postCheckin} from "./checkin-client";
import {CheckinResultPanel} from "./checkin-result";
import type {CheckinResult,UnpaidResolution} from "./service";

type Detector={detect:(source:CanvasImageSource)=>Promise<{rawValue:string}[]>};
type DetectorCtor=new(options:{formats:string[]})=>Detector;
function tokenFromText(text:string){try{const url=new URL(text);return url.searchParams.get("token")??text}catch{return text.trim()}}

export function CameraScanner({eventId,demoPaidToken,demoUnpaidToken}:{eventId?:string;demoPaidToken?:string;demoUnpaidToken?:string}){
  const video=useRef<HTMLVideoElement>(null);
  const controls=useRef<IScannerControls|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const locked=useRef(false);
  const recent=useRef(new Map<string,number>());
  const lastToken=useRef("");
  const resetTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [result,setResult]=useState<CheckinResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [manual,setManual]=useState("");
  const [cameraError,setCameraError]=useState("");
  const [timings,setTimings]=useState<number[]>([]);
  const [auto,setAuto]=useState(true);
  const autoRef=useRef(true);
  useEffect(()=>{autoRef.current=auto},[auto]);

  const reset=useCallback(()=>{if(resetTimer.current)clearTimeout(resetTimer.current);locked.current=false;setResult(null);setBusy(false);setManual("")},[]);

  const submit=useCallback(async(raw:string,resolution?:UnpaidResolution)=>{
    const token=tokenFromText(raw);
    if(!token)return;
    const detectedAt=performance.now();
    // 同じQRの連続検出(3秒以内)は無視。確認操作(resolution付き)は常に通す。
    const seen=recent.current.get(token);
    if(!resolution&&seen&&detectedAt-seen<3000)return;
    recent.current.set(token,detectedAt);
    locked.current=true;lastToken.current=token;setBusy(true);
    const {result:next}=await postCheckin({method:"QR",token,eventId,resolution});
    setResult(next);setBusy(false);feedback(next.kind);
    setTimings(t=>[...t.slice(-49),performance.now()-detectedAt]);
    if(next.kind==="OK"&&autoRef.current)resetTimer.current=setTimeout(reset,1400);
  },[eventId,reset]);

  useEffect(()=>{
    let active=true;let raf=0;
    (async()=>{
      try{
        const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
        if(!active){media.getTracks().forEach(t=>t.stop());return}
        stream.current=media;
        const el=video.current;if(!el)return;
        el.srcObject=media;await el.play().catch(()=>undefined);
        const Native=(window as unknown as {BarcodeDetector?:DetectorCtor}).BarcodeDetector;
        if(Native){
          const detector=new Native({formats:["qr_code"]});let last=0;
          const loop=async(now:number)=>{
            if(!active)return;
            if(!locked.current&&now-last>60&&el.readyState>=2){last=now;try{const codes=await detector.detect(el);if(codes[0]?.rawValue&&!locked.current)void submit(codes[0].rawValue)}catch{/* 次のフレームで再試行 */}}
            raf=requestAnimationFrame(loop);
          };
          raf=requestAnimationFrame(loop);
        }else{
          const {BrowserQRCodeReader}=await import("@zxing/browser");
          const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:40,delayBetweenScanSuccess:300});
          controls.current=await reader.decodeFromStream(media,el,decoded=>{if(active&&decoded&&!locked.current)void submit(decoded.getText())});
        }
      }catch{setCameraError("カメラを開始できません。権限を確認するか、受付コード・参加者検索をご利用ください。")}
    })();
    return()=>{active=false;cancelAnimationFrame(raf);controls.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());if(resetTimer.current)clearTimeout(resetTimer.current)};
  },[]);

  return <section className="scanner-layout">
    <div className="camera-panel">
      <div className="camera-title"><Camera/><span>QRコードを枠内に合わせてください</span></div>
      <div className="video-wrap"><video ref={video} muted playsInline/><i/><i/><i/><i/></div>
      {cameraError&&<p className="camera-error">{cameraError}</p>}
      <form onSubmit={e=>{e.preventDefault();void submit(manual)}} className="manual-scan"><Keyboard/><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="QRトークンまたはURLを入力"/><button>確認</button></form>
      <label className="scan-auto"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>受付OKのあと自動で次の読み取りへ</label>
      {timings.length>0&&<p className="scan-metrics">直近{timings.length}件: p50 {Math.round(percentile(timings,50))}ms / p95 {Math.round(percentile(timings,95))}ms / 最大 {Math.round(Math.max(...timings))}ms（検出→結果表示）</p>}
      {demoPaidToken&&<div className="demo-scan-buttons"><button onClick={()=>void submit(demoPaidToken)}>デモ：入金済</button><button onClick={()=>void submit(demoUnpaidToken??"")}>デモ：未入金</button></div>}
    </div>
    <CheckinResultPanel result={result} busy={busy} onNext={reset} onResolve={r=>void submit(lastToken.current,r)} nextLabel="次の参加者を読み取る"/>
  </section>;
}
