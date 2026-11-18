import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getAccess } from "@/lib/access";
import { isAdmin } from "@/lib/access-policy";
import { isSupabaseConfigured } from "@/lib/env";
import { signOut } from "@/app/auth/actions";

export const metadata: Metadata = {
  title: "LIFE STAGE COMMON CORE",
  description: "LIFE STAGE 共通アクセス権・データベース基盤",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#13294b" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const access = isSupabaseConfigured() ? await getAccess() : null;
  return (
    <html lang="ja">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <b>LIFE STAGE</b>
            <span>COMMON CORE</span>
          </Link>
          {access?.authenticated ? (
            <div className="who">
              <span className="email">{access.email}</span>
              {access.status === "active" ? <Link href="/account">ACCOUNT</Link> : null}
              {isAdmin(access) ? <Link href="/admin">ADMIN</Link> : null}
              <form action={signOut} className="inline-form">
                <button type="submit" className="btn small ghost">ログアウト</button>
              </form>
            </div>
          ) : null}
        </header>
        {children}
      </body>
    </html>
  );
}
