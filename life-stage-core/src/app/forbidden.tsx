import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">403 FORBIDDEN</div>
        <h1>アクセス権がありません</h1>
        <p>このページを表示する権限がありません。必要な場合は管理者にお問い合わせください。</p>
      </section>
      <div className="card auth-card">
        <Link href="/" className="btn ghost">トップへ戻る｜Back to home</Link>
      </div>
    </main>
  );
}
