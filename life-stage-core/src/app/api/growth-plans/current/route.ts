import { currentSnapshot } from "@/lib/snapshot-handler";

/** GET /api/growth-plans/current — APP02 の本人最新確定成長計画 */
export function GET() {
  return currentSnapshot("APP02", "growth_plan");
}
