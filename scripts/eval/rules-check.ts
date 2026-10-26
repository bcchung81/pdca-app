// 공통 규칙 문서 교차 검증(운영 적재 전 점검) — 규칙 줄마다 가리킨 원문 조각 전문과 견줘 opus가 판정합니다.
// 입력: <out>/rules/<id>.json·.md(scripts/knowledge/rules-digest.ts 산출) + 운영 DB 조각(읽기만).
// 출력: <out>/rules-check/<id>.json(절 묶음별 판정·문서 단위 점검, 이어 하기) + review.md(맞음이 아닌 것만 + 단위별 건수 표).
// Claude API는 안 부름: runClaudeCli는 CLI만 부르고 자식 환경에 API 키를 넘기지 않음.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/rules-check.ts --out docs/analysis/eval/2026-10-26-select --units track-biz,BZ-1,BZ-2,BZ-3 [--concurrency 2] [--dry]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { loadBundleChunks } from "../../lib/ai/context.ts";
import { runPool } from "../../lib/ai/pool.ts";
import type { BundleChunk } from "../../lib/knowledge/bundle.ts";
import { type DigestAnswer, chunkHash, digestChunks, digestTarget } from "../../lib/knowledge/rules-digest.ts";
import {
  type Batch, type DocCheck, DocCheckSchema, type RuleVerdicts, RuleVerdictSchema, type UnitResult,
  batchRequest, batchSources, batchesOf, blocked, checkVerdicts, docRequest, jsonSchemaOf, reviewMarkdown, tallyOf,
} from "./rules-check-core.ts";

process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODEL = "opus";
const EFFORT = "high";
const TIMEOUT_MS = 30 * 60_000;

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const outArg = flag("--out");
if (!outArg) throw new Error("--out <폴더>가 필요합니다.");
const units = (flag("--units") ?? "track-biz,BZ-1,BZ-2,BZ-3").split(",").map((s) => s.trim()).filter(Boolean);
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");
const out = resolve(outArg);
const dir = join(out, "rules-check");
mkdirSync(dir, { recursive: true });

const system = readFileSync("scripts/eval/prompts/rules-check.md", "utf8");
const batchSchema = jsonSchemaOf(RuleVerdictSchema);
const docSchema = jsonSchemaOf(DocCheckSchema);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const log = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

interface Digest { id: string; title: string; answer: DigestAnswer; md: string; inputs: Array<{ key: string; hash: string }>; model: string | null }
const loadDigest = (id: string): Digest => {
  const j = JSON.parse(readFileSync(join(out, "rules", `${id}.json`), "utf8"));
  if (!j.answer) throw new Error(`${id}: 규칙 문서 답이 없습니다`);
  return { id, title: j.title, answer: j.answer, md: readFileSync(join(out, "rules", `${id}.md`), "utf8"), inputs: j.inputs, model: j.model };
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const trackChunks = new Map<string, BundleChunk[]>();

interface Unit { digest: Digest; chunks: BundleChunk[]; file: string; result: UnitResult }
const prepared: Unit[] = [];
for (const id of units) {
  const digest = loadDigest(id);
  const target = digestTarget(id);
  if (!trackChunks.has(target.track.id)) trackChunks.set(target.track.id, await loadBundleChunks(db, target.track));
  const chunks = digestChunks(trackChunks.get(target.track.id)!, target);
  const nowHash = new Map(chunks.map((c) => [c.chunk_key, chunkHash(c)]));
  const staleKeys = digest.inputs.filter((x) => nowHash.get(x.key) !== x.hash).map((x) => x.key);
  const file = join(dir, `${id}.json`);
  const old: UnitResult | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const result: UnitResult = { id, title: digest.title, checkedAt: new Date().toISOString(), model: old?.model ?? MODEL, staleKeys, batches: old?.batches ?? {}, doc: old?.doc ?? null };
  const live = new Set(batchesOf(digest.answer).map((b) => b.id));
  for (const k of Object.keys(result.batches)) if (!live.has(k)) delete result.batches[k]; // 고쳐 만든 뒤 사라진 절 묶음의 옛 판정은 버림
  prepared.push({ digest, chunks, file, result });
  log(`${id}: 규칙 ${digest.answer.rules.length}줄, 입력 조각 ${chunks.length}개${staleKeys.length ? `, 글이 바뀐 조각 ${staleKeys.length}개` : ""}`);
}

type Task = { unit: Unit; kind: "batch"; batch: Batch } | { unit: Unit; kind: "doc" };
const tasks: Task[] = [];
for (const u of prepared) {
  for (const batch of batchesOf(u.digest.answer)) tasks.push({ unit: u, kind: "batch", batch });
  tasks.push({ unit: u, kind: "doc" });
}
const hashOfBatch = (u: Unit, b: Batch) => sha(JSON.stringify([b.rules, b.rules.map((i) => u.digest.answer.rules[i]), batchSources(u.digest.answer, b, u.chunks).map(chunkHash), sha(system)]));
const hashOfDoc = (u: Unit) => sha(JSON.stringify([u.digest.md, u.chunks.map(chunkHash), sha(system)]));
const done = (t: Task) => (t.kind === "batch" ? t.unit.result.batches[t.batch.id]?.hash === hashOfBatch(t.unit, t.batch) : t.unit.result.doc?.hash === hashOfDoc(t.unit));
const todo = tasks.filter((t) => !done(t));
log(`호출 ${tasks.length}건 중 이미 끝난 ${tasks.length - todo.length}건 건너뜀, ${todo.length}건 실행${dry ? " (드라이런 — 호출 안 함)" : ` — CLI ${MODEL}·${EFFORT}, 동시 ${concurrency}`}`);

const save = (u: Unit) => writeFileSync(u.file, `${JSON.stringify(u.result, null, 1)}\n`, "utf8");

async function ask<T>(prompt: string, schema: object, parse: (raw: unknown) => { ok: true; value: T } | { ok: false; errors: string[] }): Promise<{ value: T; model: string }> {
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await runClaudeCli({ system, prompt: last ? `${prompt}\n\n(앞 답이 검사에 걸렸습니다: ${last} — 고쳐서 다시 답하세요.)` : prompt, schema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
      const r = parse(res.output);
      if (r.ok) return { value: r.value, model: res.model };
      last = r.errors.join(" / ");
    } catch (e) {
      last = e instanceof Error ? `${e.message}${(e as { detail?: string }).detail ? ` — ${(e as { detail?: string }).detail}` : ""}` : String(e);
    }
  }
  throw new Error(last.slice(0, 400));
}

if (!dry)
  await runPool(todo, concurrency, async (t) => {
    const t0 = Date.now();
    const u = t.unit;
    if (t.kind === "batch") {
      const keys = new Set(u.chunks.map((c) => c.chunk_key));
      const r = await ask<RuleVerdicts>(batchRequest(u.digest.answer, t.batch, u.chunks), batchSchema, (raw) => {
        const p = RuleVerdictSchema.safeParse(raw);
        if (!p.success) return { ok: false, errors: [p.error.message.slice(0, 200)] };
        const errs = checkVerdicts(p.data, t.batch, keys);
        return errs.length ? { ok: false, errors: errs } : { ok: true, value: p.data };
      });
      u.result.model = r.model;
      u.result.batches[t.batch.id] = { hash: hashOfBatch(u, t.batch), rules: t.batch.rules, verdicts: r.value.verdicts, ms: Date.now() - t0 };
      log(`${u.digest.id} 「${t.batch.id}」 ${t.batch.rules.length}줄 — 맞음 아님 ${r.value.verdicts.filter((v) => v.verdict !== "맞음").length}건 (${Math.round((Date.now() - t0) / 1000)}초)`);
    } else {
      const keys = new Set(u.chunks.map((c) => c.chunk_key));
      const r = await ask<DocCheck>(docRequest(u.digest.md, u.chunks), docSchema, (raw) => {
        const p = DocCheckSchema.safeParse(raw);
        if (!p.success) return { ok: false, errors: [p.error.message.slice(0, 200)] };
        const bad = p.data.gaps.flatMap((g) => g.keys).filter((k) => !keys.has(k));
        return bad.length ? { ok: false, errors: [`입력에 없는 key: ${bad.join(",")}`] } : { ok: true, value: p.data };
      });
      u.result.doc = { hash: hashOfDoc(u), gaps: r.value.gaps, ms: Date.now() - t0 };
      log(`${u.digest.id} 문서 단위 — 지적 ${r.value.gaps.length}건 (${Math.round((Date.now() - t0) / 1000)}초)`);
    }
    u.result.checkedAt = new Date().toISOString();
    save(u);
  }, { onError: (e, i) => log(`실패 ${todo[i].unit.digest.id} ${todo[i].kind === "batch" ? (todo[i] as { batch: Batch }).batch.id : "문서 단위"}: ${e instanceof Error ? e.message : String(e)}`) });

// 요약: 현재 요청 해시와 맞는(=끝난) 결과만 세어 review.md를 씀
if (!dry) {
  for (const u of prepared) save(u);
  writeFileSync(join(dir, "review.md"), reviewMarkdown(prepared.map((u) => ({ result: u.result, answer: u.digest.answer }))), "utf8");
}
console.log("\n단위        판정줄  맞음  뜻다름  과장  빠짐  키잘못  문서지적  올리기");
for (const u of prepared) {
  const t = tallyOf(u.result);
  const pending = tasks.filter((x) => x.unit === u && !done(x)).length;
  console.log(`${u.digest.id.padEnd(10)} ${String(t.total).padStart(5)} ${Object.values(t.counts).map((n) => String(n).padStart(5)).join(" ")} ${String(t.gaps).padStart(8)}   ${pending ? `미완료 ${pending}건` : blocked(u.result) ? "막힘" : "가능"}`);
}
console.log(`\n${join(dir, "review.md")}`);
