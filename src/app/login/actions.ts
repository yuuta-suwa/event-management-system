"use server";

import { AuthError } from "next-auth";
import {headers} from "next/headers";
import { signIn } from "@/auth";
import {clientAddress,consumeRateLimit} from "@/server/rate-limit";

export async function login(_: string | undefined, formData: FormData) {
  const address=clientAddress(await headers());
  const rate=consumeRateLimit(`login:${address}`,8,15*60*1000);
  if(!rate.allowed)return `ログイン試行回数が上限に達しました。${rate.retryAfterSeconds}秒後にお試しください。`;
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) return "メールアドレスまたはパスワードが正しくありません。";
    throw error;
  }
}
