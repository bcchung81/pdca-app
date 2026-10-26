// 선별 방식 실험 정답지 만들기(지식공급 하이브리드 선별 계획 2단계) — 시험 카드의 범위 안 사례류 조각 전부를 Claude CLI로 「이 과제와 관련 있는가」 판정.
// 운영 DB는 읽기만(cards·knowledge_chunks·card_knowledge_scope select). Claude API는 부르지 않음: runClaudeCli는 CLI만 부르고 자식 환경에 API 키를 넘기지 않음.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/label-scope.ts --out docs/analysis/eval/2026-10-26-select
//   [--cards 주요사업1/7-가,…] [--concurrency 2] [--dry]
// 결과: <out>/labels/<cards.uid>.json · 묶음별 임시 <out>/labels/_parts/<uid>-<nn>.json(이어 하기) · run.txt · summary.json
// 지시문: scripts/eval/prompts/label-scope.md (기준 문구는 과제 매칭 match-knowledge와 같게 — 확신 high/unsure ↔ yes/maybe)
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { matchCardSummary } from "../../lib/ai/match.ts";
import { escapeXml } from "../../lib/ai/writer.ts";
import { buildBundle, bundleRefs } from "../../lib/knowledge/bundle.ts";
import { businessById } from "../../lib/knowledge/dictionaries.ts";
import { flattenHtmlTables } from "../../lib/knowledge/rich-text.ts";
import { SELECTABLE_ROLES, chunkRole, type ChunkRole } from "../../lib/knowledge/chunk-role.ts";
import { lensTopic } from "../../lib/reports/lens.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";
import type { BusinessId } from "../../lib/knowledge/types.ts";

const MODEL = "opus";
const EFFORT = "high";
const TIMEOUT_MS = 30 * 60_000;
const PART_CHARS = 40_000;
const ENVELOPE = 160;
const DEFAULT_CARDS = ["주요사업1/7-가", "주요사업2/1-가", "주요사업3/5-가", "경영관리1/1-1", "경영관리3/3-1", "경영관리4/4-2"];

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const out = opt("--out");
if (!out) throw new Error("사용법: label-scope.ts --out <dir> [--cards id,…] [--concurrency 2] [--dry]");
const cardIds = opt("--cards")?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_CARDS;
const concurrency = Math.max(1, Number(opt("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");

const labelsDir = `${out}/labels`;
const partsDir = `${labelsDir}/_parts`;
mkdirSync(partsDir, { recursive: true });
const log = (s: string) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
  console.log(line);
  appendFileSync(`${labelsDir}/run.txt`, line + "\n");
};

// ───────────── 프롬프트 ─────────────
const mdText = readFileSync("scripts/eval/prompts/label-scope.md", "utf8");
const section = (name: string) => {
  const m = mdText.split(/^<!-- @(\S+) -->$/m);
  const i = m.indexOf(name);
  if (i < 0) throw new Error(`프롬프트 절 없음: ${name}`);
  return m[i + 1].trim();
};
const promptHash = createHash("sha256").update(mdText).digest("hex").slice(0, 8);
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? `{{${k}}}`));

const Verdict = z.object({ key: z.string(), verdict: z.enum(["yes", "maybe", "no"]), basis: z.string() });
const AnswerSchema = z.object({ items: z.array(Verdict) });
const jsonSchema = z.toJSONSchema(AnswerSchema, { target: "draft-7" });
type Item = z.infer<typeof Verdict> & { role: ChunkRole };

// ───────────── 카드·조각 읽기(읽기 전용) ─────────────
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

interface Ref { key: string; title: string; unitType: string; text: string; where: string; role: ChunkRole }
interface Part { n: number; refs: Ref[]; chars: number }
interface CardPlan { cardId: string; uid: string; unit: string; trackName: string; businessName: string; summary: string; refs: Ref[]; parts: Part[] }

const refChars = (r: Ref) => r.title.length + r.text.length + r.where.length + ENVELOPE;
function splitParts(refs: Ref[]): Part[] {
  const parts: Part[] = [];
  let cur: Ref[] = [];
  let size = 0;
  for (const r of refs) {
    const n = refChars(r);
    if (cur.length && size + n > PART_CHARS) {
      parts.push({ n: parts.length + 1, refs: cur, chars: size });
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += n;
  }
  if (cur.length) parts.push({ n: parts.length + 1, refs: cur, chars: size });
  return parts;
}

const bizChunks = await loadBundleChunks(db, trackSpecOfUnit("BZ-1"));
const mgChunks = await loadBundleChunks(db, trackSpecOfUnit("MG-1"));
const plans: CardPlan[] = [];
for (const cardId of cardIds) {
  const { data: card, error } = await db.from("cards").select("id, uid, eval_unit_id, data").eq("id", cardId).single();
  if (error || !card) throw new Error(`카드를 읽지 못함: ${cardId} (${error?.message})`);
  const unit = String(card.eval_unit_id); // 경영관리 카드의 평가단위가 곧 지표 MG-n(앱도 evalUnitId만 넘김)
  const isMg = unit.startsWith("MG-");
  // 앱과 같은 호출: 경평 초안(purpose=report)의 묶음 — 대응표(linked)는 층 구성에 영향 없음
  const kb = buildBundle(isMg ? mgChunks : bizChunks, { evalUnitId: unit, data: card.data }, [], null, "report");
  const metaOf = new Map((isMg ? mgChunks : bizChunks).map((c) => [c.chunk_key, c]));
  const refs: Ref[] = bundleRefs(kb)
    .map((r) => {
      const c = metaOf.get(r.key)!;
      return { key: r.key, title: r.title, unitType: r.unitType, text: r.text, where: r.where ?? "", role: chunkRole(c) };
    })
    .filter((r) => SELECTABLE_ROLES.includes(r.role));
  const businessName = isMg ? (MGMT_INDICATORS.find((u) => u.id === unit)?.name ?? unit) : businessById(unit as BusinessId).name2026;
  const topic = lensTopic(card.data as Record<string, unknown>);
  plans.push({ cardId, uid: String(card.uid), unit, trackName: isMg ? "경영관리 지표" : "주요사업", businessName, summary: `${matchCardSummary(card.data)}\n핵심 주제: ${topic}`, refs, parts: splitParts(refs) });
}

log(`계획: 카드 ${plans.length}장, 모델 ${MODEL}/${EFFORT}, 동시 ${concurrency}, 지시문 해시 ${promptHash}${dry ? " (--dry)" : ""}`);
for (const p of plans) {
  const byRole = SELECTABLE_ROLES.map((r) => `${r} ${p.refs.filter((x) => x.role === r).length}`).join(" ");
  log(`  ${p.cardId} (${p.uid}, ${p.unit} ${p.businessName}): 조각 ${p.refs.length}건 · ${p.refs.reduce((n, r) => n + r.text.length, 0)}자 · 묶음 ${p.parts.length}개 [${byRole}]`);
}
if (dry) {
  log(`합계: 조각 ${plans.reduce((n, p) => n + p.refs.length, 0)}건, 묶음 ${plans.reduce((n, p) => n + p.parts.length, 0)}개`);
  process.exit(0);
}

// ───────────── 묶음 판정 ─────────────
const envelope = (r: Ref) => `<source key="${escapeXml(r.key)}" unit="${escapeXml(r.unitType)}" title="${escapeXml(r.title)}"${r.where ? ` where="${escapeXml(r.where)}"` : ""}>\n${escapeXml(flattenHtmlTables(r.text))}\n</source>`;
const partFile = (p: CardPlan, part: Part) => `${partsDir}/${p.uid}-${String(part.n).padStart(2, "0")}.json`;

function check(raw: unknown, keys: string[]): { ok: true; items: z.infer<typeof Verdict>[] } | { ok: false; errors: string[] } {
  const parsed = AnswerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 6) };
  const got = parsed.data.items.map((i) => i.key);
  const errors: string[] = [];
  const dup = [...new Set(got.filter((x, i) => got.indexOf(x) !== i))];
  const missing = keys.filter((k) => !got.includes(k));
  const extra = [...new Set(got.filter((k) => !keys.includes(k)))];
  if (dup.length) errors.push(`중복 ${dup.length}: ${dup.slice(0, 3).join(",")}`);
  if (missing.length) errors.push(`빠짐 ${missing.length}: ${missing.slice(0, 3).join(",")}`);
  if (extra.length) errors.push(`모르는 key ${extra.length}: ${extra.slice(0, 3).join(",")}`);
  return errors.length ? { ok: false, errors } : { ok: true, items: parsed.data.items };
}

interface Task { plan: CardPlan; part: Part }
const tasks: Task[] = plans.flatMap((plan) => plan.parts.map((part) => ({ plan, part })));
const failed: string[] = [];

function partDone(t: Task): boolean {
  const f = partFile(t.plan, t.part);
  if (!existsSync(f)) return false;
  const d = JSON.parse(readFileSync(f, "utf8")) as { promptHash: string; items: { key: string }[] };
  const keys = t.part.refs.map((r) => r.key);
  return d.promptHash === promptHash && keys.length === d.items.length && keys.every((k) => d.items.some((i) => i.key === k));
}

async function runTask(t: Task): Promise<void> {
  const { plan, part } = t;
  const tag = `${plan.cardId} 묶음 ${part.n}/${plan.parts.length}`;
  const vars = { track: plan.trackName, business: plan.businessName, card: plan.summary, count: part.refs.length, part: `${part.n}/${plan.parts.length}`, chunks: part.refs.map(envelope).join("\n") };
  const system = fill(section("system"), vars);
  const prompt = fill(section("request"), vars);
  const keys = part.refs.map((r) => r.key);
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await runClaudeCli({ system, prompt, schema: jsonSchema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
      const c = check(res.output, keys);
      if (c.ok) {
        writeFileSync(partFile(plan, part), JSON.stringify({ promptHash, model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, attempt, items: c.items }, null, 1));
        log(`완료 ${tag} — ${keys.length}건 (${Math.round((Date.now() - t0) / 1000)}초, 시도 ${attempt})`);
        return;
      }
      last = `답 검사 실패: ${c.errors.join(" / ")}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    log(`실패 ${tag} (시도 ${attempt}): ${last.slice(0, 300)}`);
  }
  failed.push(tag);
  log(`오류 기록 ${tag}: 두 번 다 실패 — 다음으로`);
}

const todo = tasks.filter((t) => !partDone(t));
log(`묶음 전체 ${tasks.length}개, 남은 ${todo.length}개`);
const t00 = Date.now();
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) await runTask(todo[next++]);
  }),
);
if (todo.length) log(`판정 끝: ${Math.round((Date.now() - t00) / 60000)}분, 실패 묶음 ${failed.length}개${failed.length ? ` (${failed.join(", ")})` : ""}`);

// ───────────── 카드별 결과 ─────────────
const labelsOf = new Map<string, { plan: CardPlan; items: Item[] }>();
for (const plan of plans) {
  if (!plan.parts.every((part) => partDone({ plan, part }))) {
    log(`카드 결과 보류: ${plan.cardId} — 끝나지 않은 묶음이 있음(다시 실행하면 이어서 함)`);
    continue;
  }
  const items: Item[] = [];
  let judgedAt = "";
  for (const part of plan.parts) {
    const d = JSON.parse(readFileSync(partFile(plan, part), "utf8")) as { items: z.infer<typeof Verdict>[]; ms: number };
    const roleOf = new Map(part.refs.map((r) => [r.key, r.role]));
    items.push(...part.refs.map((r) => ({ ...d.items.find((i) => i.key === r.key)!, role: roleOf.get(r.key)! })));
    judgedAt = new Date().toISOString();
  }
  writeFileSync(`${labelsDir}/${plan.uid}.json`, JSON.stringify({ cardId: plan.cardId, uid: plan.uid, unit: plan.unit, model: MODEL, effort: EFFORT, promptHash, judgedAt, items }, null, 1));
  labelsOf.set(plan.cardId, { plan, items });
}

// ───────────── 요약 + 기존 CLI 판정 417건 대조 ─────────────
const rows: { cardId: string; chunk_key: string; status: string }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("card_knowledge_scope").select("card_id, chunk_key, status, confirmed_by").eq("method", "ai").in("status", ["confirmed", "rejected"]).is("confirmed_by", null).order("card_id").order("chunk_key").range(from, from + 999);
  if (error) throw new Error(`대응표를 읽지 못함: ${error.message}`);
  rows.push(...(data ?? []).map((r) => ({ cardId: r.card_id as string, chunk_key: r.chunk_key as string, status: r.status as string })));
  if ((data ?? []).length < 1000) break;
}
const counts: Record<string, Record<string, { yes: number; maybe: number; no: number }>> = {};
const cmp = { total: rows.length, inLabeledCards: 0, matched: 0, agree: 0, disagree: 0, maybe: 0, notJudged: 0, maybeByStatus: { confirmed: 0, rejected: 0 }, disagreeDetail: { confirmedButNo: 0, rejectedButYes: 0 } };
for (const [cardId, { items }] of labelsOf) {
  const c = (counts[cardId] = {} as Record<string, { yes: number; maybe: number; no: number }>);
  for (const it of items) (c[it.role] ??= { yes: 0, maybe: 0, no: 0 })[it.verdict]++;
  const verdictOf = new Map(items.map((i) => [i.key, i.verdict]));
  for (const r of rows.filter((x) => x.cardId === cardId)) {
    cmp.inLabeledCards++;
    const v = verdictOf.get(r.chunk_key);
    if (!v) cmp.notJudged++;
    else {
      cmp.matched++;
      if (v === "maybe") {
        cmp.maybe++;
        cmp.maybeByStatus[r.status as "confirmed" | "rejected"]++;
      } else if ((r.status === "confirmed") === (v === "yes")) cmp.agree++;
      else {
        cmp.disagree++;
        if (r.status === "confirmed") cmp.disagreeDetail.confirmedButNo++;
        else cmp.disagreeDetail.rejectedButYes++;
      }
    }
  }
}
const decided = cmp.agree + cmp.disagree;
const summary = { out, model: MODEL, effort: EFFORT, promptHash, failedParts: failed, cards: Object.keys(counts), counts, vsExistingCli: { ...cmp, agreementRateExcludingMaybe: decided ? cmp.agree / decided : null } };
writeFileSync(`${labelsDir}/summary.json`, JSON.stringify(summary, null, 1));

console.log("\n카드 × 성격: yes / maybe / no");
for (const [cardId, byRole] of Object.entries(counts)) {
  const tot = { yes: 0, maybe: 0, no: 0 };
  const cells = Object.entries(byRole).map(([role, c]) => {
    tot.yes += c.yes; tot.maybe += c.maybe; tot.no += c.no;
    return `${role} ${c.yes}/${c.maybe}/${c.no}`;
  });
  console.log(`${cardId.padEnd(14)} 합 ${tot.yes}/${tot.maybe}/${tot.no} | ${cells.join(" · ")}`);
}
console.log(`\n기존 CLI 판정 ${cmp.total}건 중 이번 카드 ${cmp.inLabeledCards}건, 이번 판정에 있는 것 ${cmp.matched}건(없는 것 ${cmp.notJudged}건): 일치 ${cmp.agree} · 불일치 ${cmp.disagree}(확정인데 no ${cmp.disagreeDetail.confirmedButNo}, 제외인데 yes ${cmp.disagreeDetail.rejectedButYes}) · maybe ${cmp.maybe} → 일치율(maybe 제외) ${decided ? ((cmp.agree / decided) * 100).toFixed(1) + "%" : "—"}`);
if (failed.length) process.exitCode = 1;
