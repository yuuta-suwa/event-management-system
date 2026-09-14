import { redirect } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await auth()) redirect("/dashboard");
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark"><CalendarCheck2 aria-hidden="true" /></div>
        <p className="eyebrow">EVENT OPERATIONS</p>
        <h1>おかえりなさい</h1>
        <p className="muted">イベント運営の状況を、ひとつの画面で。</p>
        <LoginForm />
        <p className="security-note">管理者から発行されたアカウントでログインしてください</p>
      </section>
    </main>
  );
}
