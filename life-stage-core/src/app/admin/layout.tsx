import { AdminNav } from "@/components/admin-nav";
import { requirePage } from "@/lib/access";

/**
 * 管理画面の外枠。ここでは「管理者であること」のみ確認する（MFA 登録ページを表示するため）。
 * App Router のレイアウトは画面遷移時に再評価されないことがあるため、
 * 各ページでも必ず requirePage({ kind: "admin" }) を呼び、MFA を含めて再確認する。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePage({ kind: "admin", skipMfa: true }, "/admin");
  return (
    <div className="shell">
      <AdminNav />
      <main className="main">{children}</main>
    </div>
  );
}
