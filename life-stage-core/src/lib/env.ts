/** 公開してよい設定値のみ。secret / service_role キーはこのアプリでは扱わない。 */
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が未設定です（.env.example 参照）");
  }
  if (/^sb_secret_/.test(key) || key.includes("service_role")) {
    throw new Error("ブラウザ公開用キーに secret/service_role キーが設定されています。直ちに設定を見直してください");
  }
  return { url, key };
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
