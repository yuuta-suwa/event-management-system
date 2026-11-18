/** 招待の表示状態（pending のうち期限切れは expired として扱う） */
export function invitationView(status: string, expiresAt: string, now: Date = new Date()): string {
  return status === "pending" && new Date(expiresAt).getTime() <= now.getTime() ? "expired" : status;
}
