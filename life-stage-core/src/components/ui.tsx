import type { ReactNode } from "react";
import { messageFor } from "@/lib/errors";

export function PageHeader({ en, ja, desc, children }: { en: string; ja: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="page-head row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <div className="en">{en}</div>
        <h1>{ja}</h1>
        {desc ? <p>{desc}</p> : null}
      </div>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ en, ja }: { en: string; ja: string }) {
  return (
    <h2 className="section-title">
      {en}
      <span>｜{ja}</span>
    </h2>
  );
}

type Tone = "ok" | "warn" | "danger" | "navy" | "gold" | "plain";
export function Badge({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "ok", label: "利用中 Active" },
  suspended: { tone: "warn", label: "停止中 Suspended" },
  revoked: { tone: "danger", label: "利用権剥奪 Revoked" },
  invited: { tone: "plain", label: "招待中 Invited" },
  deletion_pending: { tone: "danger", label: "削除手続中 Deletion pending" },
  deleted: { tone: "plain", label: "削除済 Deleted" },
  pending: { tone: "gold", label: "招待中 Pending" },
  expired: { tone: "plain", label: "期限切れ Expired" },
  accepted: { tone: "ok", label: "受諾済 Accepted" },
  superseded: { tone: "plain", label: "再発行済 Superseded" },
  succeeded: { tone: "ok", label: "成功 Succeeded" },
  failed: { tone: "danger", label: "失敗 Failed" },
  requested: { tone: "warn", label: "申請中 Requested" },
  confirmed: { tone: "danger", label: "確定 Confirmed" },
  cancelled: { tone: "plain", label: "取消 Cancelled" },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "plain" as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const ROLE: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", mentor: "Mentor" };
export function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="muted small">User</span>;
  return (
    <span className="chips">
      {roles.map((r) => (
        <Badge key={r} tone={r === "super_admin" ? "navy" : r === "admin" ? "gold" : "plain"}>
          {ROLE[r] ?? r}
        </Badge>
      ))}
    </span>
  );
}

/** ?ok= / ?error= のフラッシュ表示 */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    const m = messageFor(error);
    return (
      <div className="notice error" role="alert">
        {m.ja}
        <span className="en">{m.en}</span>
      </div>
    );
  }
  if (ok) {
    return (
      <div className="notice ok" role="status">
        保存しました（{ok}）<span className="en">Saved.</span>
      </div>
    );
  }
  return null;
}

export function formatDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(v));
}

export const APP_LABEL: Record<string, string> = {
  APP01: "APP01｜THE FINAL DISCOVERY",
  APP02: "APP02｜SELF-REALIZATION ENGINE",
  APP03: "APP03｜MAKE IT REAL",
};
