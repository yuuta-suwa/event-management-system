import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EventForm } from "@/features/events/event-form";
import { updateEvent } from "@/features/events/actions";
import { getEvent,listCategories } from "@/features/events/data";
import { requireUser } from "@/server/authz";
export default async function EditEventPage({params}:{params:Promise<{id:string}>}){const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const{id}=await params;const[event,categories]=await Promise.all([getEvent(id,user),listCategories()]);if(!event)notFound();return <><AppHeader active="events"/><main className="content-shell narrow"><div className="page-heading"><div><p className="eyebrow">EDIT EVENT</p><h1>イベントを編集</h1><p>{event.name}</p></div></div><EventForm action={updateEvent.bind(null,id)} categories={categories} event={event}/></main></>}
