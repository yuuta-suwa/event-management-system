import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({test:{environment:"node",exclude:["**/node_modules/**","metaevo-shift/**"],coverage:{provider:"v8",reporter:["text","json"]}},resolve:{alias:{"@":path.resolve(__dirname,"src")}}});
