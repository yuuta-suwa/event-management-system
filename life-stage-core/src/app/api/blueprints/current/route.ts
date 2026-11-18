import { currentSnapshot } from "@/lib/snapshot-handler";

/** GET /api/blueprints/current — APP01 の本人最新確定スナップショット */
export function GET() {
  return currentSnapshot("APP01", "life_blueprint");
}
