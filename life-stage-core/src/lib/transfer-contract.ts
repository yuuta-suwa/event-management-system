import { z } from "zod";

/**
 * 連携API契約（schema_version 1.0）。DB 側でも同じ必須項目を検証する（二重防御）。
 * 詳細は docs/API_CONTRACTS.md。
 */
export const TransferRequest = z.object({
  snapshot_id: z.uuid(),
  schema_version: z.literal("1.0"),
  consent_version: z.string().trim().min(1).max(32),
  /** 本人が内容を確認し、引き継ぎに同意したこと（UIのチェックボックス） */
  confirmed: z.literal(true),
});
export type TransferRequest = z.infer<typeof TransferRequest>;

export const TRANSFER_ROUTES = {
  "app01-to-app02": { source: "APP01", target: "APP02", snapshotType: "life_blueprint" },
  "app02-to-app03": { source: "APP02", target: "APP03", snapshotType: "growth_plan" },
} as const;

/** APP01 → APP02：LIFE BLUEPRINT 確定スナップショット（APP01 仕様書 §10） */
export const LifeBlueprintV1 = z.object({
  blueprint_id: z.uuid(),
  life_purpose: z.string().min(1),
  priority_desires: z.array(z.string()).max(10),
  budget_summary: z.record(z.string(), z.unknown()),
  vision_board_asset_refs: z.array(z.string()),
  gap_analysis: z.record(z.string(), z.unknown()),
  goals: z.array(z.object({ type: z.enum(["long", "mid", "short"]), description: z.string(), deadline: z.string().nullable() })),
  priority_capabilities: z.array(z.string()),
  first_action: z.string(),
  first_action_date: z.string().nullable(),
  consent_version: z.string(),
});

/** APP02 → APP03：承認済み成長計画（APP02 仕様書 §21）。6能力×10年＝60セル */
export const APP02_ABILITIES = ["attraction", "recruitment", "education", "development", "operations", "management"] as const;
export const GrowthPlanV1 = z
  .object({
    plan_id: z.uuid(),
    vision_version: z.union([z.number().int(), z.string()]),
    start_year: z.number().int().min(2000).max(2100),
    mode: z.enum(["DISCOVERY", "CONVICTION", "LEGACY"]),
    focus_abilities: z.array(z.enum(APP02_ABILITIES)),
    cells: z
      .array(z.object({ ability: z.enum(APP02_ABILITIES), year_index: z.string().regex(/^([1-9]|10)$/) }).loose())
      .length(60)
      .refine((cells) => new Set(cells.map((c) => `${c.ability}:${c.year_index}`)).size === 60, "cells must cover 6 abilities x 10 years"),
    /** APP02 の暫定自己診断（APP03 の正式認定ではない） */
    provisional_assessment: z.record(z.string(), z.unknown()),
    approved_at: z.string(),
  })
  .loose()
  .refine((p) => !("certifications" in p) && !("titles" in p) && !("certified_levels" in p), "certification fields are not allowed");

export const SnapshotRequest = z.discriminatedUnion("snapshot_type", [
  z.object({ app_code: z.literal("APP01"), snapshot_type: z.literal("life_blueprint"), schema_version: z.literal("1.0"), payload: LifeBlueprintV1 }),
  z.object({ app_code: z.literal("APP02"), snapshot_type: z.literal("growth_plan"), schema_version: z.literal("1.0"), payload: GrowthPlanV1 }),
]);
