import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";

export async function requireUser(roles?: readonly UserRole[]) {
  const user = await validatedSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function validatedSessionUser(){
  const session=await auth();
  if(!session?.user)return null;
  if(isLocalDemo())return session.user;
  const current=await import("@/server/db").then(({db})=>db.user.findUnique({where:{id:session.user.id},select:{status:true,role:true}}));
  return current?.status==="ACTIVE"&&current.role===session.user.role?session.user:null;
}

export function isLocalDemo() {
  return process.env.ENABLE_LOCAL_DEMO_AUTH === "true";
}
