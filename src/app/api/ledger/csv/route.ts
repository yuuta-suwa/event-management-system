import {NextResponse} from "next/server";
import {buildLedger} from "@/features/ledger/data";
import {ledgerCsv} from "@/features/ledger/csv";
import {ledgerAccess} from "@/features/ledger/access";
import {isLocalDemo,validatedSessionUser} from "@/server/authz";
import {db} from "@/server/db";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const user=await validatedSessionUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const eventId=new URL(request.url).searchParams.get("event")??"";
  if(isLocalDemo()||!eventId||!await ledgerAccess(user.id,eventId))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const ledger=await buildLedger(eventId);
  if(!ledger)return NextResponse.json({error:"NOT_FOUND"},{status:404});
  await db.auditLog.create({data:{actorId:user.id,action:"LEDGER_CSV_EXPORTED",entityType:"Event",entityId:eventId}});
  return new NextResponse(ledgerCsv(ledger),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ledger-${eventId}.csv"`,"Cache-Control":"no-store"}});
}
