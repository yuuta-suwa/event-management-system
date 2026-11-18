import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAccess } from "@/lib/access";
import { isAdmin } from "@/lib/access-policy";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  await connection(); // 常にリクエスト時に判定（ビルド時の静的化を防ぐ）
  if (!isSupabaseConfigured()) {
    return (
      <main className="narrow">
        <div className="notice warn">
          Supabase の接続設定（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）が未設定です。README の手順を参照してください。
          <span className="en">Supabase environment variables are not configured.</span>
        </div>
      </main>
    );
  }
  const access = await getAccess();
  if (access.authenticated) {
    if (access.status !== "active") redirect("/status");
    redirect(isAdmin(access) ? "/admin" : "/account");
  }
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">INVITATION ONLY</div>
        <h1>LIFE STAGE</h1>
        <p>
          APP01〜APP03 共通のアクセス基盤です。ご利用には管理者からの招待が必要です。
          <br />
          <span className="small">This service is invitation-only.</span>
        </p>
      </section>
      <div className="card auth-card">
        <p>招待メールのリンクを開いてください。登録済みの方はログインできます。</p>
        <Link href="/login" className="btn">ログイン｜Sign in</Link>
      </div>
    </main>
  );
}
