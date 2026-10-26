// 과제 매칭·준비물 작업(prep_jobs)을 보고, 등록하고, 처리한다(참고자료 3단계).
//
//   pnpm prep status                                  # 종류·상태별 작업 건수
//   pnpm prep enqueue --match [--business BZ-1] [--card <카드 id>] [--doc <문서 id>] [--dry-run]
//                                                     # 이미 적재된 공통 문서를 활성 카드와 (다시) 매칭하도록 작업 등록 — 등록만 함
//   pnpm prep run [--ai] [--kinds a,b] [--limit N] [--budget <초>] [--dry-run]
//                                                     # 대기 작업 처리. 지금 처리기가 있는 작업(match_knowledge)은 모두 AI 호출이라
//                                                     # --ai가 있을 때만 돎(로컬은 CLI, Vercel 환경변수가 없으면 provider 규칙대로)
//
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY. 처리기는 매칭·준비물 표만 씁니다(lib/prep/tables.ts).
// 운영 DB를 가리키는 .env.local이면 운영에 씁니다 — AI 작업은 실행 전에 건수를 확인하고, 모델 호출 비용이 큰 일은 사용자 승인을 받은 뒤에 돌립니다.

import { createAdminClient } from "../../lib/supabase/admin.ts";
import { enqueueWith } from "../../lib/prep/enqueue-core.ts";
import { mergeQueuedJob } from "../../lib/prep/merge-queued.ts";
import { PREP_HANDLERS } from "../../lib/prep/handlers/index.ts";
import { ALL_PREP_KINDS } from "../../lib/prep/policy.ts";
import { fanOutMatch } from "../../lib/prep/queue.ts";
import { drainPrepJobs } from "../../lib/prep/run.ts";
import { SCOPE_UNIT_TYPES } from "../../lib/prep/scope.ts";
import { prepStore } from "../../lib/prep/store.ts";
import type { PrepKind } from "../../lib/prep/types.ts";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const AI_KINDS: PrepKind[] = ["match_knowledge"];
const db = createAdminClient();
const host = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();

function must<T>(label: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data as T;
}

async function tally(kinds?: readonly PrepKind[]) {
  const q = db.from("prep_jobs").select("kind, status");
  const rows = must("prep_jobs", await (kinds ? q.in("kind", [...kinds]) : q)) as Array<{ kind: string; status: string }>;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(`${r.kind}\t${r.status}`, (counts.get(`${r.kind}\t${r.status}`) ?? 0) + 1);
  return counts;
}

function printTally(counts: Map<string, number>) {
  if (counts.size === 0) return console.log("  (작업 없음)");
  for (const [k, n] of [...counts].sort()) {
    const [kind, status] = k.split("\t");
    console.log(`  ${kind.padEnd(24)} ${status.padEnd(8)} ${n}`);
  }
}

async function status() {
  console.log(`DB ${host}`);
  printTally(await tally());
}

async function enqueue() {
  if (!flag("--match")) throw new Error("사용법: pnpm prep enqueue --match [--business BZ-1] [--card <카드 id>] [--doc <문서 id>] [--dry-run]");
  const docs = must("knowledge_documents", await db.from("knowledge_documents").select("doc_id, unit_counts").eq("status", "ingest")) as Array<{ doc_id: string; unit_counts: Record<string, number> | null }>;
  const scopeDocs = docs.filter((d) => SCOPE_UNIT_TYPES.some((t) => (d.unit_counts?.[t] ?? 0) > 0)).map((d) => d.doc_id);
  const doc = value("--doc");
  if (doc && !scopeDocs.includes(doc)) throw new Error(`대응표 대상 조각이 있는 문서가 아닙니다: ${doc} (가능: ${scopeDocs.join(", ")})`);
  let cq = db.from("cards").select("id, eval_unit_id").eq("status", "active");
  const business = value("--business");
  const card = value("--card");
  if (business) cq = cq.eq("eval_unit_id", business);
  if (card) cq = cq.eq("id", card);
  const cards = must("cards", await cq) as Array<{ id: string }>;
  const jobs = fanOutMatch(cards.map((c) => c.id), doc ? [doc] : undefined);
  console.log(`DB ${host} · 대응표 대상 문서 ${scopeDocs.length}개(${doc ?? "전체"}) · 카드 ${cards.length}장 → 작업 ${jobs.length}건`);
  if (flag("--dry-run")) return console.log("  --dry-run: 등록하지 않음");
  const { queued, skipped, merged } = await enqueueWith(
    async (job) => {
      const { error } = await db.from("prep_jobs").insert({ kind: job.kind, target: job.target, payload: job.payload ?? {} });
      return { error };
    },
    jobs,
    mergeQueuedJob(db),
  );
  console.log(`  등록 ${queued}건 · 이미 대기 중 ${skipped}건${merged ? `(그 작업에 문서 목록을 합침 ${merged}건)` : ""}. 처리: pnpm prep run --ai`);
}

async function run() {
  const wantAi = flag("--ai");
  const picked = value("--kinds")?.split(",").map((k) => k.trim()).filter(Boolean) as PrepKind[] | undefined;
  if (picked?.some((k) => !ALL_PREP_KINDS.includes(k))) throw new Error(`알 수 없는 종류: ${picked.join(",")} (가능: ${ALL_PREP_KINDS.join(", ")})`);
  const kinds = (picked ?? [...ALL_PREP_KINDS]).filter((k) => wantAi || !AI_KINDS.includes(k));
  const runnable = kinds.filter((k) => PREP_HANDLERS[k]);
  console.log(`DB ${host} · 종류 ${kinds.join(", ") || "(없음)"} · AI 작업 ${wantAi ? "포함(--ai)" : "제외(--ai 없음)"}`);
  printTally(await tally(kinds));
  const noHandler = kinds.filter((k) => !PREP_HANDLERS[k]);
  if (noHandler.length) console.log(`  처리기가 아직 없는 종류: ${noHandler.join(", ")} — 건너뜀`);
  if (flag("--dry-run") || runnable.length === 0) return console.log(flag("--dry-run") ? "  --dry-run: 처리하지 않음" : "  처리할 종류가 없습니다.");
  const limit = value("--limit") ? Number(value("--limit")) : undefined;
  const budgetMs = (value("--budget") ? Number(value("--budget")) : 3600) * 1000;
  const result = await drainPrepJobs({ store: prepStore(db), handlers: PREP_HANDLERS, kinds: runnable, budgetMs, maxJobs: limit });
  console.log(`  완료 ${result.done} · 실패 ${result.failed} · 재시도 대기 ${result.requeued} · 멈춘 작업 되돌림 ${result.reclaimed} · 남은 대기 ${result.left}`);
}

const commands: Record<string, () => Promise<void>> = { status, enqueue, run };
if (!cmd || !commands[cmd]) {
  console.error("사용법: pnpm prep <status | enqueue --match | run [--ai]>  (자세한 옵션은 scripts/prep/run.ts 머리말)");
  process.exit(1);
}
commands[cmd]().catch((e: Error) => {
  console.error(`prep ${cmd} 실패: ${e.message}`);
  process.exit(1);
});
