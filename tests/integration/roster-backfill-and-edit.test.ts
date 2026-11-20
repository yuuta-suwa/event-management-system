import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"} as {id:string;role:string;name:string}|null}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(!state.user)throw new Error("UNAUTH");if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="r".repeat(48);
describe.skipIf(!enabled)("過去の記録の入力・名簿の編集（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let imp:typeof import("@/features/roster/backfill-service");let dom:typeof import("@/features/roster/backfill-domain");let edit:typeof import("@/features/roster/edit-service");let editAct:typeof import("@/features/roster/edit-actions");let importAct:typeof import("@/features/roster/backfill-actions");let books:typeof import("@/features/ledger/books");let ledger:typeof import("@/features/ledger/data");let editDom:typeof import("@/features/roster/edit-domain");
  let eventId:string,otherEventId:string,pastYear=2037;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);
  const as=(k:string)=>{state.user=u[k]};
  const ctx=()=>({eventYear:pastYear,defaults:{payment:"PAID" as const,attendance:"ATTENDED" as const,method:"BANK_TRANSFER" as const,amount:null}});
  const parse=(text:string,over:Partial<ReturnType<typeof ctx>["defaults"]>={})=>{const r=dom.parseRosterText(text,{...ctx(),defaults:{...ctx().defaults,...over}});if(!r.ok)throw new Error(r.error);return r.rows};
  const importText=(who:string,ev:string,text:string,commit=true,over={})=>imp.importRoster(u[who],{eventId:ev,rows:parse(text,over),commit});
  const nameOf=(n:string)=>`${n}${run}`;
  const noMessages=async(ev:string)=>{expect(await db.emailLog.count({where:{eventId:ev}})).toBe(0);expect(await db.notificationJob.count({where:{eventId:ev}})).toBe(0)};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret});
    ({db}=await import("@/server/db"));imp=await import("@/features/roster/backfill-service");dom=await import("@/features/roster/backfill-domain");edit=await import("@/features/roster/edit-service");editAct=await import("@/features/roster/edit-actions");importAct=await import("@/features/roster/backfill-actions");books=await import("@/features/ledger/books");ledger=await import("@/features/ledger/data");editDom=await import("@/features/roster/edit-domain");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`RB-${run}`,slug:`rb-${randomUUID()}`}});
    for(let i=0;i<200;i++){const y=1995+Math.floor(Math.random()*40);if(!await db.event.count({where:{eventDate:{gte:new Date(`${y}-01-01T00:00:00+09:00`),lt:new Date(`${y+1}-01-01T00:00:00+09:00`)}}})){pastYear=y;break}}
    const base=(d:string)=>{const day=new Date(`${d}T18:00:00+09:00`);return {categoryId:category.id,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:new Date(day.getTime()-1800000),endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:2,price:3000,organizer:"主催",applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"CLOSED" as const}};
    // 過去・終了済み・定員2(定員を超える人数も入力できること)
    eventId=(await db.event.create({data:{...base(`${pastYear}-01-15`),name:`1月交流会-${run}`,managerId:u.mgr.id}})).id;
    otherEventId=(await db.event.create({data:{...base(`${pastYear}-02-12`),name:`2月交流会-${run}`,managerId:u.mgr.id}})).id;
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("確認(preview)では何も保存しない。登録すると、入金・受付・名簿がそろい、メール・LINEの通知は一切作られない",async()=>{
    const text=`名前,フリガナ,電話,メール,入金,金額,入金日,入金方法,出欠,受付日時,紹介者,備考\n${nameOf("山田")},ヤマダ,090-1111-2222,yamada-${run}@example.com,入金済み,3000,1/10,現金,参加,1/15 18:30,小澤,常連\n${nameOf("佐藤")},,,,入金済み,,,振込,欠席,,,\n${nameOf("鈴木")},,090-3333-4444,,未入金,,,,未受付,,,\n${nameOf("高橋")},,,,入金済み,0,,,参加,,,招待`;
    const before=await db.eventRegistration.count({where:{eventId}});
    const pv=await importText("mgr",eventId,text,false);
    expect(pv).toMatchObject({ok:true,committed:false,counts:{created:4,newPeople:4,errors:0}});
    expect(await db.eventRegistration.count({where:{eventId}})).toBe(before);
    const r=await importText("mgr",eventId,text,true);
    expect(r).toMatchObject({ok:true,committed:true,counts:{total:4,created:4,newPeople:4,skipped:0,errors:0}});
    expect(await db.eventRegistration.count({where:{eventId}})).toBe(before+4);
    const reg=async(n:string)=>db.eventRegistration.findFirstOrThrow({where:{eventId,participant:{name:nameOf(n)}},include:{participant:true,ticket:{include:{checkin:true,payments:true}}}});
    const y=await reg("山田");
    expect(y).toMatchObject({attendanceStatus:"CHECKED_IN",applicationSource:"BACKFILL"});
    expect(y.participant).toMatchObject({phone:"090-1111-2222",email:`yamada-${run}@example.com`,nameKana:"ヤマダ",notes:"常連",referrerName:"小澤"});
    expect(y.ticket).toMatchObject({status:"USED",paymentStatus:"PAID"});
    expect(y.ticket!.payments[0]).toMatchObject({amount:3000,paymentMethod:"CASH",status:"PAID",confirmedBy:u.mgr.id});
    expect(y.ticket!.payments[0].paidAt!.toISOString()).toBe(new Date(`${pastYear}-01-10T00:00:00+09:00`).toISOString());
    expect(y.ticket!.checkin).toMatchObject({checkinType:"MANUAL",checkedInBy:u.mgr.id,verification:"BACKFILL"});
    expect(y.ticket!.checkin!.checkedInAt.toISOString()).toBe(new Date(`${pastYear}-01-15T18:30:00+09:00`).toISOString());
    const s=await reg("佐藤");
    expect(s).toMatchObject({attendanceStatus:"ABSENT"});expect(s.ticket).toMatchObject({status:"ACTIVE",paymentStatus:"PAID"});expect(s.ticket!.checkin).toBeNull();
    expect(s.participant).toMatchObject({nameKana:nameOf("佐藤"),phone:"",email:""});
    expect(s.ticket!.payments[0].amount).toBe(3000); // 金額が空 → 参加費
    expect(s.ticket!.payments[0].paidAt!.toISOString()).toBe(new Date(`${pastYear}-01-15T00:00:00+09:00`).toISOString()); // 入金日が空 → 開催日
    const k=await reg("鈴木");
    expect(k).toMatchObject({attendanceStatus:"APPLIED"});expect(k.ticket).toMatchObject({status:"PROVISIONAL",paymentStatus:"UNPAID"});expect(k.ticket!.payments).toHaveLength(0);
    const t=await reg("高橋");
    expect(t.ticket!.payments[0].amount).toBe(0); // 招待などの0円も入る
    expect(t.ticket!.checkin!.checkedInAt.toISOString()).toBe(new Date(`${pastYear}-01-15T18:00:00+09:00`).toISOString()); // 受付日時が空 → 開始時刻
    await noMessages(eventId);
    expect(await db.auditLog.count({where:{action:"ROSTER_BACKFILL_CREATED",entityId:y.id}})).toBe(1);
  });
  it("定員を超えても入力できる(過去の記録のため)。入力した記録は年次・月次の帳簿と売上に反映される",async()=>{
    const reg=await db.eventRegistration.count({where:{eventId}});expect(reg).toBeGreaterThan(2); // 定員2
    const month=(await books.loadBook(u.admin,pastYear,1));
    const e=month.events.find(x=>x.id===eventId)!;
    expect(e.tickets).toMatchObject({sold:4,paid:3,sales:6000}); // 山田3000+佐藤3000+高橋0 / 鈴木は未入金
    expect(e.attended).toBe(2);
    expect(month.attendees.filter(a=>a.eventId===eventId).map(a=>a.name).sort()).toEqual([nameOf("佐藤"),nameOf("山田"),nameOf("鈴木"),nameOf("高橋")].sort());
    const l=(await ledger.buildLedger(eventId))!;expect(l.tickets).toMatchObject({count:4,paidCount:3,sales:6000});
  });
  it("同じ内容をもう一度入力しても二重に登録されない(登録済みはスキップ)。連絡先なしの同名もスキップ",async()=>{
    const before=await db.eventRegistration.count({where:{eventId}});const people=await db.participant.count();
    const text=`${nameOf("山田")},,090-1111-2222,yamada-${run}@example.com\n${nameOf("佐藤")}\n${nameOf("鈴木")},,090-3333-4444`;
    // 確認(preview)の段階で、登録済みとして「入力しない」と分かる
    expect(await importText("mgr",eventId,text,false)).toMatchObject({ok:true,committed:false,counts:{created:0,skipped:3,errors:0}});
    const r=await importText("mgr",eventId,text);
    expect(r).toMatchObject({ok:true,counts:{created:0,skipped:3,errors:0}});
    if(r.ok)expect(r.results.every(x=>x.status==="ALREADY_REGISTERED")).toBe(true);
    expect(await db.eventRegistration.count({where:{eventId}})).toBe(before);expect(await db.participant.count()).toBe(people);
  });
  it("すでに名簿にいる人(同じメール)は、新しい人を作らずこのイベントの記録だけ追加し、既存の情報は書き換えない",async()=>{
    const people=await db.participant.count();
    const r=await importText("mgr",otherEventId,`別の名前表記${run},,,yamada-${run}@example.com,入金済み,3000,2/10,現金,参加`);
    expect(r).toMatchObject({ok:true,counts:{created:1,newPeople:0,existingPeople:1}});
    expect(await db.participant.count()).toBe(people);
    const p=await db.participant.findFirstOrThrow({where:{email:`yamada-${run}@example.com`},include:{registrations:true}});
    expect(p.name).toBe(nameOf("山田"));expect(p.registrations.map(x=>x.eventId).sort()).toEqual([eventId,otherEventId].sort());
  });
  it("電話が同じだけの別人(家族など)は同一人物にしない。同じ電話で同じ名前なら同一人物",async()=>{
    const r=await importText("mgr",otherEventId,`${nameOf("鈴木")}の妻,,090-3333-4444,,入金済み,,,現金,参加`);
    expect(r).toMatchObject({counts:{newPeople:1}});
    const r2=await importText("mgr",otherEventId,`${nameOf("鈴木")},,090-3333-4444,,未入金,,,,未受付`);
    expect(r2).toMatchObject({counts:{newPeople:0,existingPeople:1}}); // 電話+同名 → 1つ目のイベントの鈴木さん
  });
  it("貼り付け内の重複・エラーの行は報告し、正しい行だけ登録する",async()=>{
    const text=`${nameOf("田中")},,,tanaka-${run}@example.com\n${nameOf("田中")}(重複),,,tanaka-${run}@example.com\n,,090-0000-0000\n${nameOf("中村")},,12,\n${nameOf("小林")}`;
    const r=await importText("mgr",otherEventId,text);
    if(!r.ok)throw new Error("x");
    expect(r.results.map(x=>[x.line,x.status])).toEqual([[1,"NEW"],[2,"DUPLICATE_IN_PASTE"],[3,"ERROR"],[4,"ERROR"],[5,"NEW"]]);
    expect(r.results[2].message).toMatch(/名前がありません/);expect(r.results[3].message).toMatch(/電話番号/);
    expect(r.counts).toMatchObject({created:2,skipped:1,errors:2});
    expect(await db.participant.count({where:{name:nameOf("中村")}})).toBe(0);
  });
  it("紹介者名がスタッフの表示名と一致すれば紹介スタッフとして記録する",async()=>{
    const su=await db.user.create({data:{name:`staff-intro-${run}`,email:`intro-${run}@example.com`,role:"RECEPTION_STAFF"}});
    const sp=await db.staffProfile.create({data:{userId:su.id,displayName:`紹介の${run}`}});
    await importText("mgr",otherEventId,`${nameOf("紹介")},,,intro-p-${run}@example.com,入金済み,,,,参加,,紹介の${run}`);
    const t=await db.ticket.findFirstOrThrow({where:{eventId:otherEventId,participant:{name:nameOf("紹介")}}});
    expect(t.introducerStaffId).toBe(sp.id);
  });
  it("権限: システム管理者・そのイベントの管理者だけ。他のイベントの管理者・受付スタッフは不可。存在しないイベントも不可",async()=>{
    const one=`${nameOf("権限")},,,perm-${run}@example.com`;
    expect(await importText("mgr2",eventId,one)).toEqual({ok:false,error:"このイベントの名簿を入力する権限がありません"});
    expect(await importText("staff",eventId,one)).toEqual({ok:false,error:"このイベントの名簿を入力する権限がありません"});
    expect(await importText("mgr",randomUUID(),one)).toEqual({ok:false,error:"イベントが見つかりません"});
    expect(await db.participant.count({where:{email:`perm-${run}@example.com`}})).toBe(0);
    expect((await importText("admin",eventId,one)).ok).toBe(true);
    // 偽のユーザーIDでも通らない
    expect(await imp.importRoster({id:"nobody"},{eventId,rows:parse(`${nameOf("偽")}`),commit:true})).toMatchObject({ok:false});
  });
  it("画面のServer Action: 確認→登録。1人ずつの入力でも同じ結果。権限のない人は拒否",async()=>{
    const f=(o:Record<string,string>)=>{const x=new FormData();for(const [k,v] of Object.entries(o))x.set(k,v);return x};
    as("mgr");
    const prev=await importAct.submitRosterImport({},f({eventId:otherEventId,intent:"preview",data:`${nameOf("画面")},,,gamen-${run}@example.com`,defPayment:"PAID",defAttendance:"ATTENDED",defMethod:"CASH"}));
    expect(prev.result).toMatchObject({committed:false,counts:{created:1}});expect(await db.participant.count({where:{email:`gamen-${run}@example.com`}})).toBe(0);
    const done=await importAct.submitRosterImport({},f({eventId:otherEventId,intent:"commit",data:`${nameOf("画面")},,,gamen-${run}@example.com`,defPayment:"PAID",defAttendance:"ATTENDED",defMethod:"CASH",defAmount:"2500"}));
    expect(done.result).toMatchObject({committed:true,counts:{created:1}});expect(done.values?.data).toBe(""); // 登録できたら入力欄は空に戻る
    const pay=await db.payment.findFirstOrThrow({where:{ticket:{participant:{email:`gamen-${run}@example.com`}}}});expect(pay).toMatchObject({amount:2500,paymentMethod:"CASH"});
    const single=await importAct.submitRosterImport({},f({eventId:otherEventId,intent:"commit",single:"1",name:nameOf("単発"),email:`tanpatsu-${run}@example.com`,payment:"未入金",method:"現金",attendance:"欠席",amount:"",paidAt:"",checkedInAt:"",phone:"",nameKana:"",introducer:"",notes:"1人ずつ"}));
    expect(single.result).toMatchObject({counts:{created:1}});
    expect(await db.eventRegistration.findFirstOrThrow({where:{participant:{email:`tanpatsu-${run}@example.com`}},include:{ticket:true}})).toMatchObject({attendanceStatus:"ABSENT",ticket:{paymentStatus:"UNPAID"}});
    expect((await importAct.submitRosterImport({},f({eventId:otherEventId,intent:"commit",data:""}))).message).toBe("記録を貼り付けてください");
    as("mgr2");expect((await importAct.submitRosterImport({},f({eventId:otherEventId,intent:"commit",data:nameOf("不可")}))).message).toMatch(/権限/);
    as("staff");await expect(importAct.submitRosterImport({},f({eventId:otherEventId,intent:"commit",data:"x"}))).rejects.toThrow("FORBIDDEN");
    await noMessages(otherEventId);
  });

  // ─── 名簿の編集 ───
  const regOf=(n:string,ev=eventId)=>db.eventRegistration.findFirstOrThrow({where:{eventId:ev,participant:{name:{startsWith:nameOf(n)}}},select:{id:true,participantId:true}});
  async function editReg(who:string,regId:string,fields:Record<string,unknown>,reason:unknown="記録の訂正",snapshot=true){
    const t=await edit.loadRosterTarget(db,regId);
    const cur=Object.fromEntries(Object.entries(t!.values).map(([k,v])=>[k,v===null?"":String(v)]));
    return edit.applyRosterEdit(u[who],{registrationId:regId,reason,fields:{...cur,...fields},snapshot:snapshot&&t?editDom.snapshotOf(t.values):undefined});
  }
  it("参加者の情報を直す: 理由・直した人・変更前後が履歴に残り、同じ人のほかのイベントにも反映される",async()=>{
    const r=await regOf("山田");
    const res=await editReg("mgr",r.id,{phone:"090-9999-0000",occupation:"会社員",age:"34"},"電話番号が変わったため");
    expect(res.ok).toBe(true);
    expect(await db.participant.findUniqueOrThrow({where:{id:r.participantId}})).toMatchObject({phone:"090-9999-0000",occupation:"会社員",age:34});
    const h=await edit.listRosterHistory(db,{registrationId:r.id,participantId:r.participantId});
    const e=h.find(x=>x.kind==="EDIT")!;
    expect(e).toMatchObject({editor:u.mgr.name,reason:"電話番号が変わったため"});
    expect(e.changes).toEqual([{field:"phone",label:"電話",before:"090-1111-2222",after:"090-9999-0000"},{field:"age",label:"年齢",before:null,after:34},{field:"occupation",label:"職業",before:null,after:"会社員"}].sort((a,b)=>["phone","age","occupation"].indexOf(a.field)-["phone","age","occupation"].indexOf(b.field)));
    expect(h.some(x=>x.kind==="BACKFILL")).toBe(true); // 「過去の記録として入力」も同じ履歴に出る
    // 同じ人の別イベントの行でも、同じ人の編集履歴が見える
    const other=await regOf("山田",otherEventId);
    expect((await edit.listRosterHistory(db,{registrationId:other.id,participantId:other.participantId})).some(x=>x.reason==="電話番号が変わったため")).toBe(true);
    await noMessages(eventId);
  });
  it("理由なし・変更なし・不正な入力・古い画面からの保存は、何も変えずに止まる",async()=>{
    const r=await regOf("佐藤");const snap=async()=>JSON.stringify(await db.participant.findUniqueOrThrow({where:{id:r.participantId}}));
    const before=await snap();
    expect(await editReg("mgr",r.id,{name:"変更"},"")).toMatchObject({ok:false,error:"reason_required"});
    expect(await editReg("mgr",r.id,{name:"変更"},"  ")).toMatchObject({ok:false,error:"reason_required"});
    expect(await editReg("mgr",r.id,{})).toMatchObject({ok:false,error:"no_change"});
    expect(await editReg("mgr",r.id,{email:"x"})).toMatchObject({ok:false,error:"invalid",fieldErrors:{email:expect.any(String)}});
    expect(await editReg("mgr",r.id,{name:""})).toMatchObject({ok:false,error:"invalid"});
    const t=await edit.loadRosterTarget(db,r.id);const oldSnap=editDom.snapshotOf(t!.values);
    expect((await editReg("mgr",r.id,{notes:"先に直した"})).ok).toBe(true);
    const cur=Object.fromEntries(Object.entries(t!.values).map(([k,v])=>[k,v===null?"":String(v)]));
    expect(await edit.applyRosterEdit(u.mgr,{registrationId:r.id,reason:"古い画面",fields:{...cur,notes:"上書き"},snapshot:oldSnap})).toMatchObject({ok:false,error:"stale"});
    expect((await db.participant.findUniqueOrThrow({where:{id:r.participantId}})).notes).toBe("先に直した");
    expect(before).not.toBe(await snap());
  });
  it("権限: 管理者・そのイベントの管理者は直せる。他のイベントの管理者・受付スタッフは直せない",async()=>{
    const r=await regOf("高橋");
    expect(await editReg("mgr2",r.id,{notes:"x"})).toMatchObject({ok:false,error:"forbidden"});
    expect(await editReg("staff",r.id,{notes:"x"})).toMatchObject({ok:false,error:"forbidden"});
    expect((await db.participant.findUniqueOrThrow({where:{id:r.participantId}})).notes).toBe("招待");
    expect((await editReg("admin",r.id,{notes:"管理者が追記"})).ok).toBe(true);
    expect(await edit.applyRosterEdit({id:"nobody"},{registrationId:r.id,reason:"x",fields:{name:"x"}})).toMatchObject({ok:false,error:"forbidden"});
  });
  it("未入金→入金済み: 入金記録が作られ、チケットが有効になり、売上に反映される。通知は送らない。入金済みを未入金には戻せない",async()=>{
    const r=await regOf("鈴木");
    const before=(await ledger.buildLedger(eventId))!;
    const res=await editReg("mgr",r.id,{payment:"PAID",amount:"",paidAt:"",method:"CASH"},"1月分の入金記録を追加");
    expect(res.ok).toBe(true);
    const row=await db.eventRegistration.findUniqueOrThrow({where:{id:r.id},include:{ticket:{include:{payments:true}}}});
    expect(row).toMatchObject({attendanceStatus:"PAID",ticket:{status:"ACTIVE",paymentStatus:"PAID"}});
    expect(row.ticket!.payments[0]).toMatchObject({amount:3000,paymentMethod:"CASH",status:"PAID",confirmedBy:u.mgr.id}); // 空欄 → 参加費・開催日
    expect((await ledger.buildLedger(eventId))!.tickets.sales).toBe(before.tickets.sales+3000);
    expect(await editReg("mgr",r.id,{payment:"UNPAID"})).toMatchObject({ok:false,error:"unpay_not_supported"});
    await noMessages(eventId);
  });
  it("入金額・入金日・入金方法を直すと、既存の入金記録が直り売上も変わる",async()=>{
    const r=await regOf("山田");const before=(await ledger.buildLedger(eventId))!.tickets.sales;
    expect((await editReg("mgr",r.id,{amount:"2500",paidAt:`${pastYear}-01-12`,method:"BANK_TRANSFER"},"実際は2,500円だった")).ok).toBe(true);
    const pays=await db.payment.findMany({where:{ticket:{registration:{id:r.id}}}});
    expect(pays).toHaveLength(1);expect(pays[0]).toMatchObject({amount:2500,paymentMethod:"BANK_TRANSFER"});
    expect(pays[0].paidAt!.toISOString()).toBe(new Date(`${pastYear}-01-12T00:00:00+09:00`).toISOString());
    expect((await ledger.buildLedger(eventId))!.tickets.sales).toBe(before-500);
  });
  it("受付: 未受付→受付済み(受付記録が作られ、チケットは使用済み)、時刻の変更、受付の取消(チケットは有効に戻る)。退出の記録があれば取消せない",async()=>{
    const r=await regOf("佐藤");
    expect((await editReg("mgr",r.id,{attendance:"ATTENDED",checkedInAt:`${pastYear}-01-15T19:05`},"来場の記録を追加")).ok).toBe(true);
    let row=await db.eventRegistration.findUniqueOrThrow({where:{id:r.id},include:{ticket:{include:{checkin:true}}}});
    expect(row).toMatchObject({attendanceStatus:"CHECKED_IN",ticket:{status:"USED",checkin:{checkinType:"MANUAL",verification:"ROSTER_EDIT",checkedInBy:u.mgr.id}}});
    expect(row.ticket!.checkin!.checkedInAt.toISOString()).toBe(new Date(`${pastYear}-01-15T19:05:00+09:00`).toISOString());
    expect((await editReg("mgr",r.id,{checkedInAt:`${pastYear}-01-15T19:20`})).ok).toBe(true);
    row=await db.eventRegistration.findUniqueOrThrow({where:{id:r.id},include:{ticket:{include:{checkin:true}}}});
    expect(row.ticket!.checkin!.checkedInAt.toISOString()).toBe(new Date(`${pastYear}-01-15T19:20:00+09:00`).toISOString());
    // 退出の記録があると取り消せない
    await db.checkout.create({data:{eventId,ticketId:row.ticketId!,participantId:r.participantId,checkedOutBy:u.mgr.id,checkoutType:"MANUAL",reasonCode:"LEAVE"}});
    expect(await editReg("mgr",r.id,{attendance:"NONE"})).toMatchObject({ok:false,error:"exit_records"});
    await db.checkout.deleteMany({where:{ticketId:row.ticketId!}});
    expect((await editReg("mgr",r.id,{attendance:"NONE"},"誤って受付済みにしていた")).ok).toBe(true);
    row=await db.eventRegistration.findUniqueOrThrow({where:{id:r.id},include:{ticket:{include:{checkin:true}}}});
    expect(row).toMatchObject({attendanceStatus:"PAID",ticket:{status:"ACTIVE",checkin:null}});
    expect((await editReg("mgr",r.id,{attendance:"ABSENT"})).ok).toBe(true);
    expect((await db.eventRegistration.findUniqueOrThrow({where:{id:r.id}})).attendanceStatus).toBe("ABSENT");
  });
  it("取消済みのチケットでも名前・連絡先は直せる。入金・出欠は直せない(欄が送られなくても、現在の値のままで誤判定しない)",async()=>{
    const r=await regOf("田中",otherEventId);
    await db.ticket.updateMany({where:{registration:{id:r.id}},data:{status:"CANCELLED",cancelledAt:new Date()}});
    const t=await edit.loadRosterTarget(db,r.id);expect(t!.recordLockedReason).toMatch(/直せません/);
    // 画面では入金・出欠の欄が無効になり送信されない
    const only={registrationId:r.id,name:`${nameOf("田中")}(改)`,nameKana:"",phone:"",email:`tanaka-${run}@example.com`};
    expect((await edit.applyRosterEdit(u.mgr,{registrationId:r.id,reason:"表記の訂正",fields:only,snapshot:editDom.snapshotOf(t!.values)})).ok).toBe(true);
    expect(await db.participant.findUniqueOrThrow({where:{id:r.participantId}})).toMatchObject({name:`${nameOf("田中")}(改)`});
    expect(await editReg("mgr",r.id,{payment:"PAID",amount:"1"})).toMatchObject({ok:false,error:"record_locked"});
  });
  it("画面のServer Action: 保存すると名簿へ、理由なしはエラー付きで編集画面へ戻る。権限のない人は拒否",async()=>{
    const r=await regOf("高橋");const f=(o:Record<string,string>)=>{const x=new FormData();for(const [k,v] of Object.entries(o))x.set(k,v);return x};
    const t=await edit.loadRosterTarget(db,r.id);const cur=Object.fromEntries(Object.entries(t!.values).map(([k,v])=>[k,v===null?"":String(v)]));
    const go=async(o:Record<string,string>)=>{try{await editAct.editRosterEntry(f({registrationId:r.id,...cur,...o}));return "none"}catch(e){return (e as Error).message}};
    as("mgr");
    expect(await go({notes:"画面から",reason:""})).toBe(`REDIRECT:/participants/edit?registration=${r.id}&error=reason_required`);
    expect(await go({notes:"画面から",reason:"画面確認"})).toBe(`REDIRECT:/participants?event=${eventId}&notice=roster_edited`);
    expect((await db.participant.findUniqueOrThrow({where:{id:r.participantId}})).notes).toBe("画面から");
    as("staff");expect(await go({notes:"x",reason:"x"})).toBe("FORBIDDEN");
    as("mgr2");expect(await go({notes:"x",reason:"x"})).toBe(`REDIRECT:/participants/edit?registration=${r.id}&error=forbidden`);
  });
});
