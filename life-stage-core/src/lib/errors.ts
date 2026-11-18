/** DB（RPC）が返すエラーコード → 画面表示（日英） */
const MESSAGES: Record<string, { ja: string; en: string }> = {
  NOT_AUTHENTICATED: { ja: "ログインしてください。", en: "Please sign in." },
  ACCOUNT_NOT_ACTIVE: { ja: "このアカウントは現在利用できません。", en: "This account is not active." },
  FORBIDDEN: { ja: "この操作を行う権限がありません。", en: "You do not have permission." },
  MFA_REQUIRED: { ja: "管理操作には二段階認証（MFA）の確認が必要です。", en: "MFA verification is required." },
  NOT_FOUND: { ja: "対象が見つかりません。", en: "Not found." },
  INVALID_EMAIL: { ja: "メールアドレスの形式が正しくありません。", en: "Invalid email address." },
  INVALID_TTL: { ja: "有効期限は1〜168時間で指定してください。", en: "Expiry must be 1–168 hours." },
  INVALID_ROLE: { ja: "役割の指定が正しくありません。", en: "Invalid role." },
  INVALID_APP: { ja: "指定したアプリは利用できません。", en: "Invalid app." },
  NO_APPS_SELECTED: { ja: "アプリを1つ以上選択してください。", en: "Select at least one app." },
  ALREADY_MEMBER: { ja: "このメールアドレスは既に登録済みです。権限管理から変更してください。", en: "Already a member." },
  PENDING_INVITATION_EXISTS: { ja: "有効な招待が既にあります。取り消しまたは再発行してください。", en: "A pending invitation exists." },
  INVITATION_NOT_PENDING: { ja: "この招待は取り消せない状態です。", en: "Invitation is not pending." },
  INVITATION_ALREADY_ACCEPTED: { ja: "受諾済みの招待は再発行できません。", en: "Invitation already accepted." },
  INVITATION_SUPERSEDED: { ja: "この招待は再発行により無効になりました。最新の招待リンクを使用してください。", en: "Invitation was superseded." },
  INVITATION_INVALID: { ja: "招待リンクが無効です。", en: "Invalid invitation link." },
  INVITATION_USED: { ja: "この招待リンクは既に使用されています。", en: "Invitation already used." },
  INVITATION_REVOKED: { ja: "この招待は取り消されました。管理者にお問い合わせください。", en: "Invitation was revoked." },
  INVITATION_EXPIRED: { ja: "招待の有効期限が切れています。管理者に再発行を依頼してください。", en: "Invitation expired." },
  EMAIL_MISMATCH: { ja: "招待されたメールアドレスと、ログインしたGoogleアカウントが一致しません。", en: "Signed-in email does not match the invitation." },
  EMAIL_NOT_VERIFIED: { ja: "メールアドレスが確認されていないアカウントです。", en: "Email not verified." },
  PROVIDER_NOT_ALLOWED: { ja: "Googleアカウントでログインしてください。", en: "Please sign in with Google." },
  ACCOUNT_NOT_ELIGIBLE: { ja: "このアカウントは停止中のため受諾できません。管理者にお問い合わせください。", en: "Account is suspended." },
  TOO_MANY_ATTEMPTS: { ja: "試行回数が多すぎます。時間をおいて再度お試しください。", en: "Too many attempts." },
  CANNOT_TARGET_SELF: { ja: "自分自身に対してこの操作はできません。", en: "Cannot perform on yourself." },
  INVALID_STATUS_TRANSITION: { ja: "現在の状態ではこの操作はできません。", en: "Invalid status transition." },
  INVALID_ACTION: { ja: "操作の指定が正しくありません。", en: "Invalid action." },
  LAST_SUPER_ADMIN: { ja: "最後の Super Admin は停止できません。", en: "Cannot suspend the last super admin." },
  TARGET_NOT_ACTIVE: { ja: "対象の利用者が有効ではありません。", en: "Target is not active." },
  TARGET_NOT_ADMIN: { ja: "対象者は Admin ではありません。", en: "Target is not an admin." },
  TARGET_NOT_MENTOR: { ja: "対象者にメンターの役割がありません。", en: "Target is not a mentor." },
  CANNOT_SCOPE_ADMIN: { ja: "管理者を担当範囲に含めることはできません。", en: "Cannot scope an admin." },
  INVALID_RELATION: { ja: "担当区分が正しくありません。", en: "Invalid relation." },
  INVALID_SETTING: { ja: "設定値が正しくありません。", en: "Invalid setting." },
  SETTING_LOCKED: { ja: "この設定は変更できません。", en: "This setting is locked." },
  SCOPE_REQUIRED: { ja: "この役割には対象範囲（例：事業ID）の入力が必要です。", en: "Scope is required for this role." },
  REASON_REQUIRED: { ja: "理由を入力してください。", en: "Reason is required." },
  DELETION_ALREADY_REQUESTED: { ja: "削除手続きは既に申請済みです。", en: "Deletion already requested." },
  CONFIRMATION_MISMATCH: { ja: "確認用メールアドレスが一致しません。", en: "Confirmation does not match." },
  CANNOT_DELETE_SUPER_ADMIN: { ja: "Super Admin は先に役割を外してから削除手続きを行ってください。", en: "Remove super admin role first." },
  APP_ACCESS_DENIED: { ja: "このアプリの利用権限がありません。", en: "No access to this app." },
  INVALID_ROUTE: { ja: "この連携経路は許可されていません。", en: "Transfer route not allowed." },
  SNAPSHOT_SUPERSEDED: { ja: "元データが更新されています。最新の内容を確認して再度引き継いでください。", en: "Source updated; please reconfirm." },
  SCHEMA_VERSION_MISMATCH: { ja: "データ形式の版が一致しません。", en: "Schema version mismatch." },
  CONSENT_REQUIRED: { ja: "引き継ぎへの同意が必要です。", en: "Consent required." },
  SHARE_TARGET_NOT_ALLOWED: { ja: "共有できるのは担当のメンター／トレーナー／リーダーのみです。", en: "Share target not allowed." },
  INVALID_EXPIRY: { ja: "期限は現在より後の日時を指定してください。", en: "Expiry must be in the future." },
  INVALID_SNAPSHOT_TYPE: { ja: "データ種別が正しくありません。", en: "Invalid snapshot type." },
  UNKNOWN: { ja: "処理できませんでした。時間をおいて再試行してください。", en: "Something went wrong." },
};

export function messageFor(code: string | null | undefined) {
  if (!code) return MESSAGES.UNKNOWN;
  return MESSAGES[code] ?? MESSAGES.UNKNOWN;
}

/** Supabase/PostgREST のエラーから業務エラーコードを取り出す（未知のものは UNKNOWN。内部情報は表示しない） */
export function errorCode(err: unknown): string {
  const msg = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");
  const m = msg.match(/^([A-Z][A-Z0-9_]{2,63})$/) ?? msg.match(/\b([A-Z][A-Z0-9_]{2,63})\b/);
  if (m && MESSAGES[m[1]]) return m[1];
  if (/permission denied/i.test(msg)) return "FORBIDDEN";
  return "UNKNOWN";
}

export function isKnownCode(code: string) {
  return code in MESSAGES;
}
