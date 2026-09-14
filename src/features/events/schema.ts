import { z } from "zod";

const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const requiredDateTime = z.string().min(16);

export const eventFormSchema = z.object({
  name: z.string().trim().min(2, "イベント名を入力してください").max(120),
  categoryId: z.string().min(1, "カテゴリーを選択してください"),
  description: z.string().trim().min(10, "説明を10文字以上で入力してください").max(5000),
  eventDate: requiredDate,
  startTime: requiredDateTime,
  receptionStartTime: requiredDateTime,
  endTime: requiredDateTime,
  venueName: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  capacity: z.coerce.number().int().min(1).max(10000),
  price: z.coerce.number().int().min(0).max(100000000),
  organizer: z.string().trim().min(1).max(160),
  applicationDeadline: requiredDateTime,
  cancelDeadline: z.string().optional(),
  cancellationPolicy: z.string().trim().min(5).max(2000),
  bankInformation: z.string().trim().min(5).max(2000),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
  lineNotifications: z.coerce.boolean().default(false),
}).superRefine((value, ctx) => {
  const start = new Date(value.startTime);
  const reception = new Date(value.receptionStartTime);
  const end = new Date(value.endTime);
  if (!(reception <= start && start < end)) ctx.addIssue({ code:"custom", path:["endTime"], message:"受付開始 ≤ 開始 < 終了となるよう設定してください" });
  if (new Date(value.applicationDeadline) > start) ctx.addIssue({ code:"custom", path:["applicationDeadline"], message:"申込締切は開始時刻より前にしてください" });
});

export type EventFormInput = z.infer<typeof eventFormSchema>;
