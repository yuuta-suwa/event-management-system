"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", en: "DASHBOARD", ja: "全体状況" },
  { href: "/admin/users", en: "USERS", ja: "利用者管理" },
  { href: "/admin/invitations", en: "INVITATIONS", ja: "招待管理" },
  { href: "/admin/permissions", en: "PERMISSIONS", ja: "権限管理" },
  { href: "/admin/assignments", en: "ASSIGNMENTS", ja: "担当者管理" },
  { href: "/admin/transfers", en: "TRANSFERS", ja: "連携状況" },
  { href: "/admin/audit", en: "AUDIT LOGS", ja: "操作履歴" },
  { href: "/admin/settings", en: "SETTINGS", ja: "設定" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="sidenav" aria-label="管理メニュー">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <b>{i.en}</b>
            <small>{i.ja}</small>
          </Link>
        );
      })}
    </nav>
  );
}
