import {NextResponse} from "next/server";
import {loadBook} from "@/features/ledger/books";
import {bookCsv} from "@/features/ledger/books-csv";
import {isLocalDemo,validatedSessionUser} from "@/server/authz";
import {db} from "@/server/db";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const user=await validatedSessionUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  if(isLocalDemo()||!(user.role==="SUPER_ADMIN"||user.role==="EVENT_MANAGER"||user.role==="RECEPTION_STAFF"))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const q=new URL(request.url).searchParams;
  const year=/^20\d{2}$/.test(q.get("year")??"")?Number(q.get("year")):new Date().getFullYear();
  const month=/^(?:[1-9]|1[0-2])$/.test(q.get("month")??"")?Number(q.get("month")):undefined;
  // 帳簿を扱えるイベント(管理者は全て・イベント管理者は担当分・決裁権者は指定分)だけが集計される
  const book=await loadBook(user,year,month);
  await db.auditLog.create({data:{actorId:user.id,action:"LEDGER_BOOK_CSV_EXPORTED",entityType:"LedgerBook",entityId:`${year}${month?`-${String(month).padStart(2,"0")}`:""}`,after:{events:book.events.length}}});
  return new NextResponse(bookCsv(book),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="ledger-book-${year}${month?`-${String(month).padStart(2,"0")}`:""}.csv"`,"Cache-Control":"no-store"}});
}
