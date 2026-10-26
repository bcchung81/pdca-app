// 참고자료 설계(docs/reference-materials.md) 0단계 측정(수동 실행 전용 — 호스티드 DB는 읽기만, 쓰지 않음).
// 0a: 카드별 규칙 범위(§4.2) 글자 수 — 층별 공통 지식 + 과제 목록 행 + 카드 + 카드 전용 자료 전체 글 + 시스템 프롬프트. 큰 PDF 로컬 파싱 시간.
// 0b(--tokens): 글자→토큰 비율 — 이 컴퓨터의 Claude Code CLI로 표본 3종 × opus·sonnet을 한 번씩 불러 답의 usage에서 빈 호출 값을 뺌(D20).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/context-size.ts [--parse] [--pdf-time] [--tokens] [--json <경로>]
//  --parse: 카드 전용 자료를 저장소에서 내려받아 kordoc으로 전체 글 길이를 잼(자르지 않음)
//  --pdf-time: resources/knowledge/att3-2604.pdf(476쪽)를 이 컴퓨터에서 읽는 시간(그림 없이·그림 포함)
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "kordoc";
import { commentSystem, reportSystem, writerSystem } from "../../lib/ai/run.ts";
import { cardOutline } from "../../lib/ai/writer.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

const args = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

async function all(table: string, cols: string, filter?: (q: LooseJson) => LooseJson): Promise<LooseJson[]> {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

type Chunk = { chunk_key: string; doc_id: string; unit_type: string; track: string; business: string | null; text: string | null; meta: Record<string, unknown> | null };
const len = (c: Chunk) => (c.text ?? "").length;
const sum = (xs: Chunk[]) => xs.reduce((a, c) => a + len(c), 0);
const PEER_GRADES = new Set(["B+", "B0"]);
const COMMON_KPI = "BZ-4";

const chunks: Chunk[] = await all("knowledge_chunks", "chunk_key, doc_id, unit_type, track, business, text, meta");
const cards = await all("cards", "id, uid, eval_unit_id, status, data", (q) => q.eq("status", "active"));
const taskMap = await all("task_map", "card_id, plan_task_key");
const materials = await all("card_materials", "id, card_id, storage_path, file_name, bytes");

// §4.2 규칙 범위 — 기관 공통 / 사업 공통 / 공통지표·사업 미지정(모든 카드) / 과제 고유
const biz = (c: Chunk) => c.track === "주요사업";
const institution = chunks.filter(
  (c) =>
    (c.doc_id === "plan-2607" && biz(c) && (c.unit_type === "plan_section" || c.unit_type === "checklist_group" || (c.unit_type === "handbook_indicator" && !c.business))) ||
    ["goal_indicator", "ceo_indicator", "ax_task"].includes(c.unit_type) ||
    (c.unit_type === "peer_case" && !c.meta?.kca && PEER_GRADES.has(String(c.meta?.grade ?? ""))),
);
const businessOf = (unit: string) =>
  chunks.filter((c) => c.business === unit && c.unit_type !== "task_list_row" && ["plan-2607", "att3-2604", "mid25-biz", "pool25-biz", "rpt25-biz"].includes(c.doc_id));
// 공통지표(BZ-4) + 사업이 정해지지 않은 실사(가점)
const commonKpi = chunks.filter((c) => c.business === COMMON_KPI || (c.doc_id === "att3-2604" && !c.business));
const taskRow = new Map(taskMap.filter((t) => t.plan_task_key).map((t) => [t.card_id, chunks.find((c) => c.chunk_key === t.plan_task_key)]));

// 카드 전용 자료 전체 글(--parse일 때만 내려받아 읽음)
const matChars = new Map<string, number>();
if (args.includes("--parse")) {
  for (const m of materials) {
    const { data, error } = await db.storage.from("card-materials").download(m.storage_path);
    if (error || !data) {
      console.log(`  자료 내려받기 실패: ${m.file_name} — ${error?.message}`);
      continue;
    }
    const t0 = Date.now();
    const r = await parse(Buffer.from(await data.arrayBuffer()), { images: false } as never).catch((e: Error) => ({ success: false, error: e.message }));
    const text = (r as { success?: boolean; markdown?: string }).success ? ((r as { markdown?: string }).markdown ?? "") : "";
    matChars.set(m.id, text.length);
    console.log(`  자료 ${m.file_name}: ${(m.bytes / 1024).toFixed(0)}KB → ${text.length}자 (${Date.now() - t0}ms)`);
  }
}

const sys = { writer: writerSystem().length, comment: commentSystem().length, report: reportSystem().length };
const inst = sum(institution);
const kpi = sum(commonKpi);
const rows = cards.map((card) => {
  const own = materials.filter((m) => m.card_id === card.id);
  const mat = own.reduce((a, m) => a + (matChars.get(m.id) ?? 0), 0);
  const task = taskRow.get(card.id);
  const b = sum(businessOf(card.eval_unit_id));
  const outline = cardOutline(card.data).length;
  return { id: card.data?.id ?? card.uid, unit: card.eval_unit_id, inst, business: b, kpi, task: task ? len(task) : 0, card: outline, files: own.length, mat, total: inst + b + kpi + (task ? len(task) : 0) + outline + mat };
});

console.log("\n# 0a 규칙 범위 글자 수(공백 포함, 조각 원문 기준)");
console.log(`기관 공통 ${inst}자(${institution.length}조각) · 공통지표·사업 미지정 ${kpi}자(${commonKpi.length}조각)`);
for (const unit of [...new Set(cards.map((c) => c.eval_unit_id))].sort()) {
  const xs = businessOf(unit);
  const by = new Map<string, number>();
  for (const c of xs) by.set(`${c.doc_id}/${c.unit_type}`, (by.get(`${c.doc_id}/${c.unit_type}`) ?? 0) + len(c));
  console.log(`${unit} 사업 공통 ${sum(xs)}자(${xs.length}조각): ${[...by].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
}
console.log(`시스템 프롬프트: 작성지원 ${sys.writer}자 · 코멘트 ${sys.comment}자 · 경평 집필 ${sys.report}자`);
const totals = rows.map((r) => r.total).sort((a, b) => a - b);
const q = (p: number) => totals[Math.min(totals.length - 1, Math.floor(p * totals.length))];
console.log(`카드 ${rows.length}장 근거 합계(시스템 제외): 최소 ${totals[0]} · 중앙 ${q(0.5)} · 최대 ${totals[totals.length - 1]}자`);
console.log(`카드 글(cardOutline): 최소 ${Math.min(...rows.map((r) => r.card))} · 최대 ${Math.max(...rows.map((r) => r.card))}자 · 과제 목록 행이 있는 카드 ${rows.filter((r) => r.task).length}장`);
console.log(`카드 전용 자료: ${materials.length}건(${new Set(materials.map((m) => m.card_id)).size}장)${args.includes("--parse") ? ` · 전체 글 ${[...matChars.values()].reduce((a, b) => a + b, 0)}자` : " (--parse로 글 길이)"}`);
for (const r of rows.filter((x) => x.files)) console.log(`  ${r.id}: 자료 ${r.files}건 ${r.mat}자 → 합계 ${r.total}자`);

if (args.includes("--pdf-time")) {
  const bytes = await readFile("resources/knowledge/att3-2604.pdf");
  for (const images of [false, true]) {
    const t0 = Date.now();
    const r = (await parse(bytes, { images } as never)) as { success?: boolean; markdown?: string };
    console.log(`\n# 큰 PDF 로컬 읽기(att3-2604 ${(bytes.length / 1048576).toFixed(1)}MB, images ${images}): ${((Date.now() - t0) / 1000).toFixed(1)}초 · ${r.markdown?.length ?? 0}자`);
  }
}

// 0b: CLI 한 번 부르기 — 도구 없음·설정 끔·한 턴, 입력 토큰 = 캐시 밖 + 캐시 읽기 + 캐시 쓰기
async function cliTokens(model: string, prompt: string): Promise<{ tokens: number; model: string; turns: number }> {
  const dir = await mkdtemp(join(tmpdir(), "pdca-measure-"));
  try {
    const sysFile = join(dir, "system.md");
    await writeFile(sysFile, "받은 글을 요약하지 말고 「확인」 한 단어로만 답합니다.", "utf8");
    const argv = ["-p", "--output-format", "json", "--system-prompt-file", sysFile, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--safe-mode", "--max-turns", "1", "--model", model, "--effort", "low"];
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.env.CLAUDE_CLI_PATH || "claude", argv, { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
      let s = "";
      child.stdout.setEncoding("utf8").on("data", (x: string) => (s += x));
      child.on("error", reject);
      child.on("close", () => resolve(s));
      child.stdin.end(prompt, "utf8");
    });
    const d = JSON.parse(out.trim());
    const u = d.usage ?? {};
    return { tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), model: Object.keys(d.modelUsage ?? {}).join(",") || model, turns: d.num_turns ?? 0 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (args.includes("--tokens")) {
  const pick = (f: (c: Chunk) => boolean) => chunks.filter(f).map((c) => c.text ?? "").join("\n\n");
  const samples = {
    "관리계획 서술(plan_section)": pick((c) => c.doc_id === "plan-2607" && c.unit_type === "plan_section" && biz(c)),
    "전년 보고서 절(BZ-1)": pick((c) => c.doc_id === "rpt25-biz" && c.business === "BZ-1"),
    "실사 질의응답(BZ-1 qa_pair)": pick((c) => c.unit_type === "qa_pair" && c.business === "BZ-1"),
  };
  const tail = "\n\n위 글을 받았으면 「확인」이라고만 답하세요.";
  console.log("\n# 0b 글자→토큰 비율(CLI usage, 빈 호출 뺌)");
  for (const model of ["opus", "sonnet"]) {
    const base = await cliTokens(model, tail.trim());
    console.log(`${model}: 빈 호출 ${base.tokens}토큰 · 모델 ${base.model} · 턴 ${base.turns}`);
    for (const [name, text] of Object.entries(samples)) {
      const r = await cliTokens(model, text + tail);
      const t = r.tokens - base.tokens;
      console.log(`  ${name}: ${text.length}자 → ${t}토큰 · 토큰/자 ${(t / text.length).toFixed(3)} · 턴 ${r.turns}`);
    }
  }
}

const jsonAt = args[args.indexOf("--json") + 1];
if (args.includes("--json") && jsonAt) await writeFile(jsonAt, JSON.stringify({ sys, inst, kpi, rows }, null, 1));
