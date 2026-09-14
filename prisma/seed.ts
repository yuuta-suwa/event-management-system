import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
const db=new PrismaClient();
async function main(){const email=(process.env.SEED_ADMIN_EMAIL??"admin@example.com").toLowerCase();const password=process.env.SEED_ADMIN_PASSWORD;if(!password||password.length<12)throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");await db.user.upsert({where:{email},update:{},create:{email,name:"システム管理者",role:UserRole.SUPER_ADMIN,passwordHash:await hash(password,12)}});await Promise.all([{name:"イベント",slug:"event"},{name:"セミナー",slug:"seminar"}].map(c=>db.eventCategory.upsert({where:{slug:c.slug},update:{name:c.name},create:c})));}
main().finally(()=>db.$disconnect());
