// 선별 방식 실험 판정 표본 심판 — 사람 확인 표본(judges/human-review.md) 30건 중 사람이 판정한 1~8번은 그대로 쓰고, 나머지를 Claude CLI opus로 재판정.
// 정답지·Jev·경량 판정은 심판에게 보여 주지 않음(닻 효과). 운영 DB는 읽기만, Claude API 안 씀(runClaudeCli는 자식 환경에 API 키를 넘기지 않음).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/adjudicate-sample.ts --out docs/analysis/eval/2026-10-26-select [--from 9] [--concurrency 2]
// 결과: <out>/judges/adjudicated.json · adjudicated-summary.json · 카드별 임시 <out>/judges/_adjudicate/<uid>.json(이어 하기)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { escapeXml } from "../../lib/ai/writer.ts";
import { businessById } from "../../lib/knowledge/dictionaries.ts";
import { whereWithNote } from "../../lib/knowledge/revision-note.ts";
import { flattenHtmlTables } from "../../lib/knowledge/rich-text.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";
import type { BusinessId } from "../../lib/knowledge/types.ts";

const MODEL = "opus";
const EFFORT = "xhigh";
const TIMEOUT_MS = 30 * 60_000;
const HUMAN_MAX = 8;

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const out = opt("--out");
if (!out) throw new Error("사용법: adjudicate-sample.ts --out <dir> [--from 9] [--concurrency 2]");
const from = Number(opt("--from") ?? HUMAN_MAX + 1);
const concurrency = Math.max(1, Math.min(2, Number(opt("--concurrency") ?? 2) || 2));
const judgesDir = `${out}/judges`;
const tmpDir = `${judgesDir}/_adjudicate`;
mkdirSync(tmpDir, { recursive: true });
const log = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

// ───────────── 표본 읽기(human-review.md) ─────────────
interface Sample { n: number; cardId: string; key: string }
const review = readFileSync(`${judgesDir}/human-review.md`, "utf8");
const samples: Sample[] = review
  .split(/^## /m)
  .slice(1)
  .map((blk) => {
    const h = blk.match(/^(\d+)\.\s+(.+?)\s+—\s/);
    const k = blk.match(/조각: `([^`]+)`/);
    if (!h || !k) throw new Error(`표본 절을 읽지 못함: ${blk.slice(0, 60)}`);
    return { n: Number(h[1]), cardId: h[2], key: k[1] };
  });
const humanAnswers = JSON.parse(readFileSync(`${judgesDir}/human-answers.json`, "utf8")) as Record<string, string>;

// ───────────── 프롬프트 ─────────────
const labelMd = readFileSync("scripts/eval/prompts/label-scope.md", "utf8");
const adjMd = readFileSync("scripts/eval/prompts/adjudicate-scope.md", "utf8");
const sectionOf = (md: string, name: string) => {
  const m = md.split(/^<!-- @(\S+) -->$/m);
  const i = m.indexOf(name);
  if (i < 0) throw new Error(`프롬프트 절 없음: ${name}`);
  return m[i + 1].trim();
};
const promptHash = createHash("sha256").update(labelMd + adjMd).digest("hex").slice(0, 8);
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? `{{${k}}}`));

const Verdict = z.object({ key: z.string(), verdict: z.enum(["yes", "maybe", "no"]), basis: z.string() });
const AnswerSchema = z.object({ items: z.array(Verdict) });
const jsonSchema = z.toJSONSchema(AnswerSchema, { target: "draft-7" });

// ───────────── 카드·조각(읽기 전용) ─────────────
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

/** 빈 값(빈 문자열·null·빈 배열/객체)을 덜어 낸 카드 원장 JSON — 글은 하나도 자르지 않음 */
function prune(v: unknown): unknown {
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === "object") {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prune(x)]).filter(([, x]) => x !== undefined));
    return Object.keys(o).length ? o : undefined;
  }
  if (typeof v === "string") return v.trim() ? v : undefined;
  return v === null ? undefined : v;
}

const labelFiles = readdirSync(`${out}/labels`).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f));
const uidOf = new Map(labelFiles.map((f) => { const d = JSON.parse(readFileSync(`${out}/labels/${f}`, "utf8")) as { cardId: string; uid: string }; return [d.cardId, d.uid] as const; }));

const chunkText = new Map<string, { title: string; unitType: string; where: string; text: string }>();
for (const t of ["BZ-1", "MG-1"]) {
  for (const c of await loadBundleChunks(db, trackSpecOfUnit(t))) {
    chunkText.set(c.chunk_key, { title: c.title ?? "", unitType: c.unit_type, where: whereWithNote(c) ?? "", text: String(c.text ?? "") });
  }
}

const cardIds = [...new Set(samples.filter((s) => s.n >= from && s.n > HUMAN_MAX).map((s) => s.cardId))];
const fileOf = (cardId: string) => `${tmpDir}/${uidOf.get(cardId)}.json`;
type Done = { promptHash: string; model: string; usage: unknown; costUsd: number | null; ms: number; items: z.infer<typeof Verdict>[] };
const isDone = (cardId: string) => {
  const f = fileOf(cardId);
  if (!existsSync(f)) return false;
  const d = JSON.parse(readFileSync(f, "utf8")) as Done;
  return d.promptHash === promptHash && samples.filter((s) => s.cardId === cardId && s.n >= from).every((s) => d.items.some((i) => i.key === s.key));
};

async function judgeCard(cardId: string): Promise<void> {
  const mine = samples.filter((s) => s.cardId === cardId && s.n >= from && s.n > HUMAN_MAX);
  const { data: card, error } = await db.from("cards").select("eval_unit_id, data").eq("id", cardId).single();
  if (error || !card) throw new Error(`카드를 읽지 못함: ${cardId}`);
  const unit = String(card.eval_unit_id);
  const isMg = unit.startsWith("MG-");
  const businessName = isMg ? (MGMT_INDICATORS.find((u) => u.id === unit)?.name ?? unit) : businessById(unit as BusinessId).name2026;
  const cardJson = JSON.stringify(prune(card.data), null, 1);
  const chunks = mine.map((s) => {
    const c = chunkText.get(s.key);
    if (!c) throw new Error(`조각을 읽지 못함: ${s.key}`);
    return `<source key="${escapeXml(s.key)}" unit="${escapeXml(c.unitType)}" title="${escapeXml(c.title)}"${c.where ? ` where="${escapeXml(c.where)}"` : ""}>\n${escapeXml(flattenHtmlTables(c.text))}\n</source>`;
  });
  const vars = { track: isMg ? "경영관리 지표" : "주요사업", business: businessName, card: `[과제관리카드 원장 전체 — JSON]\n${cardJson}`, count: mine.length, part: "1/1", chunks: chunks.join("\n") };
  const system = fill(sectionOf(adjMd, "system").replace("{{base}}", () => sectionOf(labelMd, "system")), vars);
  const prompt = fill(sectionOf(adjMd, "request").replace("{{base_request}}", () => sectionOf(labelMd, "request")), vars);
  const keys = mine.map((s) => s.key);
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await runClaudeCli({ system, prompt, schema: jsonSchema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
      const p = AnswerSchema.safeParse(res.output);
      const got = p.success ? p.data.items.map((i) => i.key) : [];
      if (p.success && got.length === keys.length && keys.every((k) => got.filter((g) => g === k).length === 1)) {
        writeFileSync(fileOf(cardId), JSON.stringify({ promptHash, model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, items: p.data.items } satisfies Done, null, 1));
        log(`완료 ${cardId} — ${keys.length}건 (${Math.round((Date.now() - t0) / 1000)}초, 카드 ${cardJson.length}자, 시도 ${attempt})`);
        return;
      }
      last = p.success ? `key 불일치: 받음 ${got.length}/${keys.length}` : p.error.issues.map((i) => i.message).join("; ");
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    log(`실패 ${cardId} (시도 ${attempt}): ${last.slice(0, 300)}`);
  }
  throw new Error(`${cardId} 두 번 다 실패`);
}

const todo = cardIds.filter((c) => !isDone(c));
log(`계획: 카드 ${cardIds.length}장(심판 대상 ${samples.filter((s) => s.n >= from && s.n > HUMAN_MAX).length}건), 남은 ${todo.length}장, 모델 ${MODEL}/${EFFORT}, 동시 ${concurrency}, 해시 ${promptHash}`);
const t00 = Date.now();
const failed: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) {
      const c = todo[next++];
      try { await judgeCard(c); } catch (e) { failed.push(c); log(String(e)); }
    }
  }),
);
if (todo.length) log(`심판 끝: ${((Date.now() - t00) / 60000).toFixed(1)}분, 실패 ${failed.length}장`);
if (failed.length) process.exit(1);

// ───────────── 합치기 ─────────────
interface Item { n: number; cardId: string; key: string; verdict: "yes" | "maybe" | "no"; basis: string; source: "human" | "opus" }
const items: Item[] = samples.map((s) => {
  if (s.n <= HUMAN_MAX) {
    const v = humanAnswers[String(s.n)] as Item["verdict"];
    return { ...s, verdict: v, basis: "사용자 판정", source: "human" as const };
  }
  const d = JSON.parse(readFileSync(fileOf(s.cardId), "utf8")) as Done;
  const it = d.items.find((i) => i.key === s.key)!;
  return { ...s, verdict: it.verdict, basis: it.basis, source: "opus" as const };
});
writeFileSync(`${judgesDir}/adjudicated.json`, JSON.stringify({ model: MODEL, effort: EFFORT, promptHash, items }, null, 1));

// ───────────── 대조(정답지·Jev·경량 vs 심판) ─────────────
type V = "yes" | "maybe" | "no";
const label = new Map<string, V>();
for (const f of labelFiles) for (const i of (JSON.parse(readFileSync(`${out}/labels/${f}`, "utf8")) as { cardId: string; items: { key: string; verdict: V }[] }).items) label.set(`${(JSON.parse(readFileSync(`${out}/labels/${f}`, "utf8")) as { cardId: string }).cardId}|${i.key}`, i.verdict);
const jev = new Map<string, number>();
for (const f of readdirSync(`${judgesDir}/jev`)) {
  const d = JSON.parse(readFileSync(`${judgesDir}/jev/${f}`, "utf8")) as { cardId: string; scores: { chunkKey: string; p: number }[] };
  for (const s of d.scores) jev.set(`${d.cardId}|${s.chunkKey}`, s.p);
}
const light = new Map<string, "auto" | "candidate">();
for (const [cardId, uid] of uidOf) {
  for (const f of readdirSync(`${judgesDir}/light/_parts`).filter((x) => x.startsWith(uid))) {
    for (const h of (JSON.parse(readFileSync(`${judgesDir}/light/_parts/${f}`, "utf8")) as { hits: { chunkKey: string; status: "auto" | "candidate" }[] }).hits) light.set(`${cardId}|${h.chunkKey}`, h.status);
  }
}

interface Cmp { n: number; yesAgree: number; exactAgree: number; wrongYesToNo: number; wrongNoToYes: number; verdictDist?: Record<string, number> }
function cmpFor(rows: Item[], pred: (r: Item) => V | null): Cmp {
  const c: Cmp = { n: 0, yesAgree: 0, exactAgree: 0, wrongYesToNo: 0, wrongNoToYes: 0 };
  for (const r of rows) {
    const p = pred(r);
    if (p === null) continue;
    c.n++;
    if ((p === "yes") === (r.verdict === "yes")) c.yesAgree++;
    if (p === r.verdict) c.exactAgree++;
    if (p === "yes" && r.verdict === "no") c.wrongYesToNo++;
    if (p === "no" && r.verdict === "yes") c.wrongNoToYes++;
  }
  return c;
}
const dist = (rows: Item[]) => rows.reduce<Record<string, number>>((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
const keyOf = (r: Item) => `${r.cardId}|${r.key}`;
const groupSummary = (rows: Item[]) => {
  const amb = rows.filter((r) => { const p = jev.get(keyOf(r)); return p !== undefined && p >= 0.2 && p < 0.8; });
  return {
    n: rows.length,
    verdictDist: dist(rows),
    정답지: cmpFor(rows, (r) => label.get(keyOf(r)) ?? null),
    "Jev p≥0.2": cmpFor(rows, (r) => { const p = jev.get(keyOf(r)); return p === undefined ? null : p >= 0.2 ? "yes" : "no"; }),
    "Jev 애매(0.2≤p<0.8)": { n: amb.length, verdictDist: dist(amb) },
    경량: cmpFor(rows, (r) => { const s = light.get(keyOf(r)); return s === "auto" ? "yes" : s === "candidate" ? "maybe" : "no"; }),
  };
};
const summary = { model: MODEL, effort: EFFORT, promptHash, 전체: groupSummary(items), 사람: groupSummary(items.filter((r) => r.source === "human")), opus: groupSummary(items.filter((r) => r.source === "opus")) };
writeFileSync(`${judgesDir}/adjudicated-summary.json`, JSON.stringify(summary, null, 1));

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");
for (const g of ["사람", "opus", "전체"] as const) {
  const s = summary[g];
  console.log(`\n[${g}] ${s.n}건, 심판 분포 ${JSON.stringify(s.verdictDist)}`);
  console.log("판정원            비교건수  yes기준일치  3값일치  yes→no(정답지 오류)  no→yes(정답지 오류)");
  for (const k of ["정답지", "Jev p≥0.2", "경량"] as const) {
    const c = s[k];
    console.log(`${k.padEnd(16)}  ${String(c.n).padStart(6)}  ${`${c.yesAgree} (${pct(c.yesAgree, c.n)})`.padStart(11)}  ${`${c.exactAgree} (${pct(c.exactAgree, c.n)})`.padStart(9)}  ${String(c.wrongYesToNo).padStart(8)}  ${String(c.wrongNoToYes).padStart(18)}`);
  }
  console.log(`Jev 애매(0.2≤p<0.8): ${s["Jev 애매(0.2≤p<0.8)"].n}건, 심판 분포 ${JSON.stringify(s["Jev 애매(0.2≤p<0.8)"].verdictDist)}`);
}
