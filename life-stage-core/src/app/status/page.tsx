import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { signOut } from "@/app/auth/actions";
import { SubmitButton } from "@/components/submit-button";

const COPY: Record<string, { title: string; en: string; body: string }> = {
  not_invited: {
    title: "招待が確認できません",
    en: "No invitation found for this account",
    body: "このGoogleアカウントは招待されていません。管理者から届いた招待リンクを開き、招待されたメールアドレスのアカウントでログインしてください。",
  },
  suspended: {
    title: "ご利用を一時停止しています",
    en: "Your access is suspended",
    body: "現在このアカウントのご利用は一時停止されています。データは保持されています。詳しくは管理者にお問い合わせください。",
  },
  revoked: {
    title: "ご利用いただけません",
    en: "Access revoked",
    body: "このアカウントの利用権は取り消されています。管理者にお問い合わせください。",
  },
  deletion_pending: {
    title: "削除手続き中です",
    en: "Deletion in progress",
    body: "アカウント削除の手続き中のため、ご利用いただけません。取り消しを希望される場合は管理者にお問い合わせください。",
  },
};

export default async function StatusPage() {
  const access = await getAccess();
  if (!access.authenticated) redirect("/login");
  if (access.status === "active") redirect("/");
  const c = COPY[access.status] ?? COPY.revoked;
  return (
    <main className="narrow">
      <section className="hero">
        <div className="en">{c.en.toUpperCase()}</div>
        <h1>{c.title}</h1>
      </section>
      <div className="card auth-card">
        <p>{c.body}</p>
        <p className="small muted">ログイン中：{access.email}</p>
        <form action={signOut}>
          <SubmitButton className="btn ghost">別のアカウントでログインし直す</SubmitButton>
        </form>
      </div>
    </main>
  );
}
