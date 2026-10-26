// 마이그레이션 적용. SUPABASE_DB_URL(.env.local)이 있으면 그 연결로, 없으면 `supabase link`한 프로젝트로 올립니다.
//
//   pnpm db:push             # 적용
//   pnpm db:push --dry-run   # 올릴 마이그레이션만 확인

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const args = ["db", "push", "--workdir", ROOT, "--yes"];
if (process.argv.includes("--dry-run")) args.push("--dry-run");
if (process.env.SUPABASE_DB_URL) args.push("--db-url", process.env.SUPABASE_DB_URL);
else args.push("--linked");

const r = spawnSync("supabase", args, { stdio: "inherit" });
process.exitCode = r.status ?? 1;
