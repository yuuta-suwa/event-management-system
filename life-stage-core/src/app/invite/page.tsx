import { getAccess } from "@/lib/access";
import { acceptInviteNow, signOut, startInviteLogin } from "@/app/auth/actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * 招待リンクの着地点（/invite?token=...）。
 * 未ログイン時は招待先の情報（メールアドレス等）を一切表示しない。
 */
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const access = await getAccess();
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">YOU ARE INVITED</div>
        <h1>LIFE STAGE へようこそ</h1>
        <p>招待されたメールアドレスの Google アカウントで受諾してください。</p>
      </section>
      <div className="card auth-card">
        {!token ? (
          <div className="notice error">招待リンクが正しくありません。<span className="en">Invalid invitation link.</span></div>
        ) : access.authenticated ? (
          <>
            <p>
              現在 <b>{access.email}</b> でログインしています。
              <br />
              このアカウントで招待を受諾しますか？
            </p>
            <form action={acceptInviteNow}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="btn gold">このアカウントで受諾する｜Accept</SubmitButton>
            </form>
            <form action={signOut} style={{ marginTop: 12 }}>
              <input type="hidden" name="next" value={`/invite?token=${encodeURIComponent(token)}`} />
              <SubmitButton className="btn ghost small">別のアカウントを使う</SubmitButton>
            </form>
          </>
        ) : (
          <form action={startInviteLogin}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="btn google">Google でログインして受諾する</SubmitButton>
            <p className="small muted" style={{ marginTop: 14 }}>
              招待リンクは1回のみ・有効期限内のみ使用できます。
              <br />
              Single-use link. Expires after the period set by the administrator.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
