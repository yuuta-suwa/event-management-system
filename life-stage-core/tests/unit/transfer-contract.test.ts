import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { GrowthPlanV1, LifeBlueprintV1, SnapshotRequest, TransferRequest } from "@/lib/transfer-contract";

const abilities = ["attraction", "recruitment", "education", "development", "operations", "management"];
const plan = () => ({
  plan_id: randomUUID(),
  vision_version: 1,
  start_year: 2027,
  mode: "CONVICTION",
  focus_abilities: ["education"],
  cells: abilities.flatMap((ability) => Array.from({ length: 10 }, (_, i) => ({ ability, year_index: String(i + 1), target: "x" }))),
  provisional_assessment: { education: 2 },
  approved_at: "2026-11-18T00:00:00Z",
});
const blueprint = () => ({
  blueprint_id: randomUUID(),
  life_purpose: "目的",
  priority_desires: ["a"],
  budget_summary: {},
  vision_board_asset_refs: [],
  gap_analysis: {},
  goals: [{ type: "long", description: "x", deadline: null }],
  priority_capabilities: [],
  first_action: "x",
  first_action_date: null,
  consent_version: "2026-11",
});

describe("TransferRequest", () => {
  it("本人確認（confirmed=true）と schema_version 1.0 が必須。user_id は受け取らない", () => {
    expect(TransferRequest.safeParse({ snapshot_id: randomUUID(), schema_version: "1.0", consent_version: "2026-11", confirmed: true }).success).toBe(true);
    expect(TransferRequest.safeParse({ snapshot_id: randomUUID(), schema_version: "1.0", consent_version: "2026-11", confirmed: false }).success).toBe(false);
    expect(TransferRequest.safeParse({ snapshot_id: randomUUID(), schema_version: "2.0", consent_version: "2026-11", confirmed: true }).success).toBe(false);
    const parsed = TransferRequest.parse({ snapshot_id: randomUUID(), schema_version: "1.0", consent_version: "v", confirmed: true, user_id: "attacker" });
    expect("user_id" in parsed).toBe(false);
  });
});

describe("GrowthPlanV1（APP02 60セル ≠ APP03 70マス）", () => {
  it("6能力×10年=60セルのみ受理", () => {
    expect(GrowthPlanV1.safeParse(plan()).success).toBe(true);
    const p70 = plan();
    p70.cells.push(...Array.from({ length: 10 }, (_, i) => ({ ability: "sales", year_index: String(i + 1), target: "x" })));
    expect(GrowthPlanV1.safeParse(p70).success).toBe(false);
    const dup = plan();
    dup.cells[1] = { ...dup.cells[0] };
    expect(GrowthPlanV1.safeParse(dup).success).toBe(false);
  });
  it("暫定診断に正式認定フィールドを混入できない", () => {
    expect(GrowthPlanV1.safeParse({ ...plan(), certifications: [] }).success).toBe(false);
    expect(GrowthPlanV1.safeParse({ ...plan(), titles: [] }).success).toBe(false);
  });
});

describe("SnapshotRequest", () => {
  it("アプリとデータ種別の組み合わせを固定", () => {
    expect(SnapshotRequest.safeParse({ app_code: "APP01", snapshot_type: "life_blueprint", schema_version: "1.0", payload: blueprint() }).success).toBe(true);
    expect(SnapshotRequest.safeParse({ app_code: "APP02", snapshot_type: "growth_plan", schema_version: "1.0", payload: plan() }).success).toBe(true);
    expect(SnapshotRequest.safeParse({ app_code: "APP03", snapshot_type: "growth_plan", schema_version: "1.0", payload: plan() }).success).toBe(false);
    expect(LifeBlueprintV1.safeParse({ ...blueprint(), life_purpose: "" }).success).toBe(false);
  });
});
