import { AppHeader } from "@/components/app-header";
import { EventForm } from "@/features/events/event-form";
import { createEvent } from "@/features/events/actions";
import { listCategories } from "@/features/events/data";
import { requireUser } from "@/server/authz";
export default async function NewEventPage(){await requireUser(["SUPER_ADMIN"]);const categories=await listCategories();return <><AppHeader active="events"/><main className="content-shell narrow"><div className="page-heading"><div><p className="eyebrow">NEW EVENT</p><h1>イベントを作成</h1><p>公開前に下書きとして保存できます。</p></div></div><EventForm action={createEvent} categories={categories}/></main></>}
