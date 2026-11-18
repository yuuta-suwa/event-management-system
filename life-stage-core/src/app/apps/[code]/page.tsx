import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/access";
import { APP_CODE_PATTERN } from "@/lib/access-policy";

/**
 * 各アプリの入口ゲート（APP本体は各アプリの開発段階で接続）。
 * URL を直接入力しても、サーバー側で権限を確認し、権限がなければ 403。
 */
export default async function AppGate({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!APP_CODE_PATTERN.test(code)) notFound();
  const access = await requirePage({ kind: "app", code }, `/apps/${code}`);
  const app = access.apps.find((a) => a.code === code)!;
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">{app.code}</div>
        <h1>{app.name_en}</h1>
        <p>{app.name_ja}</p>
      </section>
      <div className="card auth-card">
        <p>
          利用権限を確認しました。アプリ本体は各アプリの開発段階で接続されます（共通基盤 Ver.1.0 時点では未接続）。
          <br />
          <span className="small muted">Access verified. The app itself is not yet connected.</span>
        </p>
        <Link href="/account" className="btn ghost">アカウントへ戻る</Link>
      </div>
    </main>
  );
}
