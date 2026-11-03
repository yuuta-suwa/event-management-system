import {notFound} from "next/navigation";
import {CalendarDays,MapPin,ShieldCheck} from "lucide-react";
import {getClaimInfo} from "@/features/tickets/claim-data";
import {ClaimForm} from "@/features/tickets/claim-form";
export default async function ClaimPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const info=await getClaimInfo(token);
  if(info.status==="invalid")notFound();
  return <main className="public-shell">
    <header className="public-brand">EVENT MANAGEMENT SYSTEM</header>
    <section className="application-layout">
      <aside className="application-event">
        <span className="status-badge status-published">{info.status==="ok"&&info.kind==="transfer"?"チケット譲渡":"チケット受け取り"}</span>
        <p className="eyebrow">TICKET CLAIM</p>
        {info.status==="ok"?<>
          <h1>{info.eventName}</h1>
          <div className="public-event-info">
            <p><CalendarDays/>{info.eventDate.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}<small>{info.startTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}〜</small></p>
            <p><MapPin/>{info.venueName}<small>{info.address}</small></p>
          </div>
          <div className="price-panel"><span>参加費</span><strong>¥{info.price.toLocaleString("ja-JP")}</strong></div>
          <div className="introducer">{info.fromName} さんから{info.kind==="transfer"?"チケットが譲渡されます":"チケットが届いています"}（チケットNo. {info.ticketNumber}）</div>
        </>:<h1>{info.status==="claimed"?"このチケットはすでに受け取り済みです":info.status==="expired"?"このリンクは有効期限が切れています":info.status==="revoked"?"このリンクは取り消されました":"このチケットは現在受け取れません"}</h1>}
      </aside>
      <section className="application-form-card">
        {info.status==="ok"?<>
          <div><p className="eyebrow">YOUR INFORMATION</p><h2>あなたの情報</h2><p>ご自身の情報をご入力のうえ、チケットを受け取ってください。</p></div>
          <ClaimForm token={token}/>
        </>:<p>{info.status==="claimed"?"このリンクはすでに使用されています。チケットをお持ちの方はご自身のマイページからご確認ください。":info.status==="expired"||info.status==="revoked"?"お手数ですが、チケットを渡す方に新しいリンクの発行を依頼してください。":"チケットが受付済み・取消済みか、イベントの受付が終了しています。"}</p>}
        <p className="secure-note"><ShieldCheck/>情報は暗号化通信で安全に送信されます</p>
      </section>
    </section>
  </main>;
}
