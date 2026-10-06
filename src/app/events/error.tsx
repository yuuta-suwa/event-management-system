"use client";
import {useEffect} from "react";
import Link from "next/link";
export default function EventsError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error(error)},[error]);
  const forbidden=error.message==="FORBIDDEN";
  return <main className="content-shell narrow"><div className="form-banner" role="alert">
    <p>{forbidden?"この操作を行う権限がありません。":"保存に失敗しました。時間をおいて再度お試しください。"}</p>
    <div className="form-footer"><Link href="/events">イベント一覧に戻る</Link><button type="button" onClick={reset}>もう一度試す</button></div>
  </div></main>;
}
