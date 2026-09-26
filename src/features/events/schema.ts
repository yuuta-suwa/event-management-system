import { z } from "zod";
import { parseJstDateTime } from "@/lib/jst";

const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開催日を入力してください");
const requiredDateTime = (label:string) => z.string().min(16, `${label}を入力してください`);

export const eventFormSchema = z.object({
  name: z.string().trim().min(2, "イベント名を入力してください").max(120),
  categoryId: z.string().min(1, "カテゴリーを選択してください"),
  description: z.string().trim().min(10, "説明を10文字以上で入力してください").max(5000),
  eventDate: requiredDate,
  startTime: requiredDateTime("開始時刻"),
  receptionStartTime: requiredDateTime("受付開始"),
  endTime: requiredDateTime("終了時刻"),
  venueName: z.string().trim().min(1, "会場名を入力してください").max(160),
  address: z.string().trim().min(1, "住所を入力してください").max(300),
  capacity: z.coerce.number("定員を入力してください").int().min(1, "定員は1以上にしてください").max(10000),
  price: z.coerce.number("参加費を入力してください").int().min(0, "参加費は0以上にしてください").max(100000000),
  organizer: z.string().trim().min(1, "主催者を入力してください").max(160),
  applicationDeadline: requiredDateTime("申込締切"),
  cancelDeadline: z.string().optional(),
  cancellationPolicy: z.string().trim().min(5, "キャンセル規定を5文字以上で入力してください").max(2000),
  bankInformation: z.string().trim().min(5, "銀行振込情報を5文字以上で入力してください").max(2000),
  promoUrl: z.union([z.literal(""), z.string().trim().url("有効なURLを入力してください")]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
  lineNotifications: z.coerce.boolean().default(false),
  eveNotificationEnabled: z.coerce.boolean().default(false),
  eveNotificationTime: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  dayOfNotificationEnabled: z.coerce.boolean().default(false),
  dayOfNotificationTime: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  beforeStartNotificationEnabled: z.coerce.boolean().default(false),
  beforeStartNotificationMinutes: z.coerce.number().int().refine(v=>[30,60,180].includes(v)).default(180),
  unpaidReminderEnabled: z.coerce.boolean().default(false),
}).superRefine((value, ctx) => {
  const start = parseJstDateTime(value.startTime);
  const reception = parseJstDateTime(value.receptionStartTime);
  const end = parseJstDateTime(value.endTime);
  if (!(reception <= start && start < end)) ctx.addIssue({ code:"custom", path:["endTime"], message:"受付開始 ≤ 開始 < 終了となるよう設定してください" });
  if (parseJstDateTime(value.applicationDeadline) > start) ctx.addIssue({ code:"custom", path:["applicationDeadline"], message:"申込締切は開始時刻より前にしてください" });
});

export type EventFormInput = z.infer<typeof eventFormSchema>;
