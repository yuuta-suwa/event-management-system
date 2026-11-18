import { requirePage } from "@/lib/access";
import { safeNextPath } from "@/lib/paths";
import { PageHeader } from "@/components/ui";
import { MfaPanel } from "@/components/mfa-panel";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // 管理者であることのみ確認（MFA 未検証でも表示できる唯一の管理ページ）
  await requirePage({ kind: "admin", skipMfa: true }, "/admin/mfa");
  const { next } = await searchParams;
  const target = safeNextPath(next, "/admin");
  return (
    <>
      <PageHeader en="MFA" ja="二段階認証" desc="管理者の重要操作（招待・権限変更・停止・再開・削除）には、二段階認証済みのセッションが必要です。" />
      <MfaPanel next={target.startsWith("/admin") ? target : "/admin"} />
    </>
  );
}
