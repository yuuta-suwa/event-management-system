import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { compare } from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { db } from "@/server/db";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db) as unknown as Adapter,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12, updateAge: 60 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const localDemoEnabled = process.env.ENABLE_LOCAL_DEMO_AUTH === "true";
        const localDemoEmail = (process.env.LOCAL_DEMO_EMAIL ?? "admin@example.com").toLowerCase();
        const localDemoPassword = process.env.LOCAL_DEMO_PASSWORD;
        if (
          localDemoEnabled &&
          localDemoPassword &&
          parsed.data.email === localDemoEmail &&
          parsed.data.password === localDemoPassword
        ) {
          return {
            id: "local-demo-super-admin",
            name: "ローカル管理者",
            email: localDemoEmail,
            role: "SUPER_ADMIN",
          };
        }
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash || user.status !== "ACTIVE") return null;
        if (!(await compare(parsed.data.password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.userId = user.id; token.role = user.role; }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
