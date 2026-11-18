import Link from "next/link";
import { messageFor } from "@/lib/errors";
import { signOut } from "@/app/auth/actions";
import { SubmitButton } from "@/components/submit-button";

export default async function InviteResult({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "UNKNOWN" } = await searchParams;
  if (code === "ACCEPTED") {
    return (
      <main className="narrow">
        <section className="hero">
          <div className="en">WELCOME</div>
          <h1>登録が完了しました</h1>
          <p>招待が受諾され、指定されたアプリの利用権限が付与されました。</p>
        </section>
        <div className="card auth-card">
          <Link href="/" className="btn gold">はじめる｜Get started</Link>
        </div>
      </main>
    );
  }
  const m = messageFor(code);
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">INVITATION</div>
        <h1>招待を受諾できませんでした</h1>
      </section>
      <div className="card auth-card">
        <div className="notice error">
          {m.ja}
          <span className="en">{m.en}</span>
        </div>
        {code === "EMAIL_MISMATCH" ? (
          <form action={signOut}>
            <SubmitButton className="btn ghost">ログアウトして別のアカウントで開き直す</SubmitButton>
          </form>
        ) : (
          <Link href="/" className="btn ghost">トップへ戻る</Link>
        )}
      </div>
    </main>
  );
}
