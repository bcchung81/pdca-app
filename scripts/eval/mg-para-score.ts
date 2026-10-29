// 경영관리 경평 초안 절(문단)별 채점 — 기준은 docs/plan/경평초안-문단품질-루프.md(채점표 A·B·C·D)와 docs/plan/경평초안-원장채움-수정.md(채점표 v2 — E 성과·밀도).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/mg-para-score.ts <회차 폴더> [--no-judge] [--baseline <baseline.json>] [--concurrency 2]
//  --baseline: mg-fill-baseline.ts 산출(2025 기준값). 없으면 E1·E5는 셈하지 않음. E2는 운영 DB 카드 원장(읽기만)이 있을 때 셈.
// 입력: 회차 폴더의 *.html.json(초안 spec — scripts/smoke/ai-report-mg-smoke.ts --app 산출물) + 같은 이름 *.html.meta.json(warnings·unknownNumbers·outlineWarnings) + *.html.outline.json(구성안)
// 출력: <회차>/score.json · score.md, B 심사 결과는 <회차>/judge/<카드>-<절>.json(입력 해시가 같으면 건너뜀 — 이어 하기).
//  A·C·D·E는 결정론(mg-para-score-core.ts), B는 절마다 Claude CLI 한 번(API 안 씀 — runClaudeCli는 자식에 API 키를 넘기지 않음). --no-judge면 B 없이.
//  운영 DB는 읽기만(카드 원장 글). 같은 카드의 초안이 폴더에 둘 이상이면 심사 파일 이름이 겹치니 회차 폴더를 나눌 것.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runClaudeCli } from "../../lib/ai/cli.ts";
import { inspectionCardText } from "../../lib/ai/inspect.ts";
import { runPool } from "../../lib/ai/pool.ts";
import type { Block } from "../../lib/reports/blocks.ts";
import { draftHeight } from "../../lib/reports/block-shape.ts";
import { PAGE_MM } from "../../lib/reports/fit.ts";
import { readSection } from "../../lib/reports/section.ts";
import { cardTag } from "./judge-run-core.ts";
import { type Baseline, type CardReport, type ScoreItem, type ScoreMeta, judgeFailed, judgeItems, judgeJsonSchema, ledgerLines, scoreCard, scoreMarkdown, sectionPlainText } from "./mg-para-score-core.ts";

// Claude API는 쓰지 않음 — CLI로만
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const MODEL = "claude-opus-5-5"; // 다른 경평 심사기(writer-judge.ts 등)와 같은 모델·effort
const EFFORT = "high";
const TIMEOUT_MS = 20 * 60_000;

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const dirArg = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--concurrency" && argv[i - 1] !== "--baseline" );
if (!dirArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/mg-para-score.ts <회차 폴더> [--no-judge] [--baseline <baseline.json>] [--concurrency 2]");
  process.exit(1);
}
const dir = resolve(dirArg);
const noJudge = argv.includes("--no-judge");
const baselinePath = flag("--baseline");
const baseline: Baseline | null = baselinePath ? readJson(resolve(baselinePath)) : null;
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const judgeDir = join(dir, "judge");
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString("ko-KR", { hour12: false })}] ${s}`);

const systemText = readFileSync(new URL("./prompts/mg-para-judge.md", import.meta.url), "utf8");
const promptHash = createHash("sha256").update(systemText).digest("hex").slice(0, 8);

type Draft = { cardData?: unknown; meta: ScoreMeta; base: string; card: string; report: CardReport; spec: NonNullable<ReturnType<typeof readSection>>; blocks: Block[]; materials: string; planBlocks: number | null };
const drafts: Draft[] = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".html.json")).sort()) {
  const base = f.slice(0, -".json".length);
  const spec = readSection(readJson(join(dir, f)));
  if (!spec?.mg) {
    log(`건너뜀 ${f} — 경영관리 초안(spec.mg)이 아님`);
    continue;
  }
  const metaRaw = existsSync(join(dir, `${base}.meta.json`)) ? readJson(join(dir, `${base}.meta.json`)) : {};
  const meta: ScoreMeta = { warnings: metaRaw.warnings ?? [], unknownNumbers: metaRaw.unknownNumbers ?? [], outlineWarnings: metaRaw.outlineWarnings ?? [] };
  const outline = existsSync(join(dir, `${base}.outline.json`)) ? readJson(join(dir, `${base}.outline.json`)) : null;
  const materials = (outline?.materials ?? []) as Array<{ id: string; kind: string; text: string; when?: string; source?: string }>;
  const card = String(spec.card?.id ?? spec.task?.no ?? base);
  drafts.push({
    base,
    card,
    meta,
    report: { card, sections: [], overall: [] },
    spec,
    blocks: spec.blocks ?? [],
    materials: materials.map((m) => `${m.id} [${m.kind}${m.when ? ` · ${m.when}` : ""}] ${m.text}${m.source ? ` (출처: ${m.source})` : ""}`).join("\n"),
    planBlocks: Array.isArray(outline?.blocks) ? outline.blocks.length : null,
  });
}
if (!drafts.length) throw new Error(`채점할 *.html.json이 없음: ${dir}`);

// 카드 원장 글(운영 DB 읽기만) — 심사 입력과 E2(원장 성과 사용률)에 씀. 접속 정보가 없으면 E2를 건너뜀
const db = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
if (!db && !noJudge) throw new Error("심사에는 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY가 필요함(--env-file=.env.local)");
if (!db) log("DB 접속 정보 없음 — E2(원장 성과 사용률)는 셈하지 않음");
for (const d of drafts) {
  if (db) {
    const { data: card, error } = await db.from("cards").select("data").eq("id", d.card).single();
    if (error || !card) throw new Error(`카드를 읽지 못함: ${d.card} (${error?.message})`);
    d.cardData = card.data;
  }
  const ledger = d.cardData ? ledgerLines(d.cardData) : null;
  const metric = /^경영관리(\d+)\//.exec(d.card)?.[1];
  const pages = draftHeight(d.spec).total / PAGE_MM.height;
  d.report = { card: d.card, ...scoreCard({ blocks: d.blocks, at: d.spec.mg!.at, parts: d.spec.mg!.parts }, d.meta, d.planBlocks, { baseline, metric: metric ? `MG-${metric}` : null, pages, ledger }) };
}

if (!noJudge) {
  mkdirSync(judgeDir, { recursive: true });
  type Job = { d: Draft; sectionIndex: number; cardText: string };
  const jobs: Job[] = [];
  for (const d of drafts) {
    const cardText = inspectionCardText(d.cardData);
    d.report.sections.forEach((_, sectionIndex) => jobs.push({ d, sectionIndex, cardText }));
  }
  log(`심사 ${jobs.length}절, 모델 ${MODEL}/${EFFORT}, 동시 ${concurrency}, 해시 ${promptHash}`);
  const judgeOne = async ({ d, sectionIndex, cardText }: Job) => {
    const sec = d.report.sections[sectionIndex];
    const part = d.spec.mg!.parts[sectionIndex];
    const blocks = sec.blockIndexes.map((i) => d.blocks[i]);
    const prompt = [
      `# 심사할 절\n평가내용 ${part.evalNo} · 대주제 ${part.themeNo} ${part.themeTitle}\n절 제목: ${part.mark ? `${part.mark}. ` : ""}${part.title || part.themeTitle}\n\n${sectionPlainText(blocks)}`,
      `# 카드 원장 글\n${cardText}`,
      `# 구성안 재료 목록\n${d.materials || "(없음)"}`,
    ].join("\n\n");
    const inputHash = createHash("sha256").update(promptHash + prompt).digest("hex").slice(0, 12);
    const file = join(judgeDir, `${cardTag(d.card)}-${sec.key}.json`);
    if (existsSync(file)) {
      const old = readJson(file);
      if (old.inputHash === inputHash && Array.isArray(old.items)) {
        sec.items.push(...(old.items as ScoreItem[]));
        return;
      }
    }
    let items: ScoreItem[] | null = null;
    let last = "";
    for (let attempt = 1; attempt <= 2 && !items; attempt++) {
      const t0 = Date.now();
      try {
        const res = await runClaudeCli({ system: systemText, prompt, schema: judgeJsonSchema, model: MODEL, effort: EFFORT, timeoutMs: TIMEOUT_MS });
        items = judgeItems(res.output);
        if (!items) last = "답 형식 불일치(B1~B6 6개가 아님)";
        else writeFileSync(file, JSON.stringify({ inputHash, promptHash, model: res.model, usage: res.usage, costUsd: res.costUsd, ms: Date.now() - t0, items, raw: res.output }, null, 1));
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
      }
      if (!items) log(`실패 ${d.card} 절 ${sec.key} (시도 ${attempt}): ${last.slice(0, 200)}`);
    }
    sec.items.push(...(items ?? judgeFailed(last)));
    if (items) log(`완료 ${d.card} 절 ${sec.key} — 통과 ${items.filter((i) => i.pass).length}/6`);
  };
  await runPool(jobs, concurrency, judgeOne, { onError: (e) => log(String(e)) });
}

// 항목 순서 A·B·C·D·E 로 정렬(B는 심사 뒤에 붙으므로)
const order = (id: string) => "ABCDE".indexOf(id[0]) * 10 + Number(id[1]);
for (const d of drafts) for (const s of d.report.sections) s.items.sort((a, b) => order(a.id) - order(b.id));
const reports = drafts.map((d) => d.report);
writeFileSync(join(dir, "score.json"), JSON.stringify({ judged: !noJudge, baseline: baselinePath ?? null, model: noJudge ? null : `${MODEL}/${EFFORT}`, promptHash, cards: reports.map((r) => ({ card: r.card, sections: r.sections.map((s) => ({ key: s.key, title: s.title, items: s.items })), overall: r.overall })) }, null, 1));
writeFileSync(join(dir, "score.md"), scoreMarkdown(reports, !noJudge));
console.log(readFileSync(join(dir, "score.md"), "utf8"));
