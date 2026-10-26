// 수동 연기 시험: 경평 초안 블록 「다른 모양으로」(서버 액션 previewBlockShapes와 같은 규칙·검증 — 저장하지 않음, 2026-10-12).
// node --conditions=react-server --env-file=.env.local scripts/smoke/ai-block-shapes-smoke.ts [카드 id(기본 주요사업1/1-가)] [블록 번호(1부터, 기본 1)] [--dry] [--want <모양 코드>] [--request "<덧붙일 요청>"]
//  --dry: AI 없이 요청 글 크기(시스템·공통 지식·목록표·요청)와 바꿀 수 있는·쓸 수 없는 모양 줄만 보임(비용 없음)
// 근거는 ai-block-smoke.ts와 같은 근사(첨부 없이 — 전년 절·실사 답변·계량 실적 입력). 경영관리 초안은 근거 숫자(2025 보고서 전 장·핵심공통항목)를 더하지 않음 — 크기·검증 흐름 확인용
import { createClient } from "@supabase/supabase-js";
import { inspectionCardText } from "../../lib/ai/inspect.ts";
import { aiProvider, callReportBlock, modelLabel } from "../../lib/ai/run.ts";
import { cardOutline } from "../../lib/ai/writer.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import { reportBlockPrompts, reportBlockPromptsMg, reportDraftPrompts, reportDraftPromptsMg } from "../../lib/prompts/sets.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { blockShapesPrompt, cleanShapeOptions, readBlockShapesRequest, shapeMenuText } from "../../lib/reports/block-edit.ts";
import { blockShapeName, shapeDelta, shapeRules } from "../../lib/reports/block-shape.ts";
import { readComposition } from "../../lib/reports/composition.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { pickPrior, scorePrior, toPriorSection } from "../../lib/reports/prior.ts";
import { cleanLine, quoteFoundIn, readSection, sectionHints, sourceKey } from "../../lib/reports/section.ts";
import { isoDay } from "../../lib/format.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const pos = args.filter((a, i) => !a.startsWith("--") && !["--want", "--request"].includes(args[i - 1] ?? ""));
const [id = "주요사업1/1-가", no = "1"] = pos;
const dry = args.includes("--dry");
const year = 2026;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const { data: row } = await db.from("card_report_drafts").select("spec, outline").eq("card_id", id).eq("year", year).maybeSingle();
const spec = row?.spec ? readSection(row.spec) : null;
if (!spec?.blocks?.length) throw new Error("블록 목록 초안이 없음");
const mg = Boolean(spec.mg);

// 근거(초안을 만들 때와 같게 — 첨부는 이 시험에서 뺌)
const { data: rows } = mg ? { data: [] } : await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card.eval_unit_id);
const sections = (rows ?? []).map(toPriorSection);
const scored = scorePrior(card.data, sections);
const prior = mg ? [] : spec.priorKeys ? spec.priorKeys.map((k) => scored.find((p) => p.section.key === k)).filter((p) => p !== undefined) : pickPrior(card.data, sections);
const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report");
const { data: report } = await db.from("reports").select("inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle();
const actuals = yearActuals(card.data, (report?.inputs?.kpi ?? {}) as Record<string, string>, isoDay());
const known = [...prior.map((p) => p.section.text), ...lens.filter((x) => x.group === "survey").map((x) => x.text), ...actuals.kpi.map((k) => k.input)].join("\n");
const quoteOnly = lens.filter((x) => x.group !== "survey").map((x) => x.text).join("\n");
const cardText = `${cardOutline(card.data)}\n${inspectionCardText(card.data)}`;

// 규칙: 구성안이 있으면 그 재료, 없으면 집필 때의 도식 후보 중 이 과제만의 요소(서버 rulesOf와 같음)
const composition = readComposition(row?.outline);
const own = mg ? [] : sectionHints(card.data, prior, [], lens, actuals, year).filter((h) => h.own);
const rules = shapeRules(mg, composition, own);
const req = readBlockShapesRequest({ blockIndex: Number(no) - 1, want: flag("--want") ?? null, request: flag("--request") ?? "" }, spec, rules);
if (typeof req === "string") throw new Error(req);
const before = spec.blocks[req.blockIndex];
const { prompts } = mg ? reportBlockPromptsMg() : reportBlockPrompts();
const kbp = mg ? reportDraftPromptsMg().prompts : reportDraftPrompts().prompts;
const prompt = blockShapesPrompt(prompts, spec, req, { card: cardText, extra: known }, rules);
const system = fillFrom(prompts, "system", "system", {});
const shared = sharedTexts(kbp, kb).join("\n").length;
const list = listText(kbp, kb).length;
console.log(`provider ${aiProvider()} · 카드 ${id}${mg ? "(경영관리)" : ""} · 블록 ${req.blockIndex + 1}/${spec.blocks.length} [${before.label || "전폭"}] ${blockShapeName(before)} · 구성안 ${composition ? "있음" : "없음"} · 원하는 모양 ${req.want ?? "AI가 고름"} · 판 ${prompts.version}`);
console.log(`글자 수 — 시스템 ${system.length} · 공통 지식 ①~③ ${shared} · 목록표 ${list} · 요청 ${prompt.length} · 합계 약 ${system.length + shared + list + prompt.length}자`);
const menu = shapeMenuText(spec, req.blockIndex, rules);
console.log(`바꿀 수 있는 모양: ${menu.shapes}\n쓸 수 없는 모양: ${menu.blocked}`);
if (dry) process.exit(0);

const t0 = Date.now();
const call = await callReportBlock({ kind: "shapes", prompt, kb, mg });
const hay = sourceKey(`${cardText}\n${known}\n${quoteOnly}`);
const r = cleanShapeOptions(before, call.output, cleanLine, (q) => quoteFoundIn(hay, q), rules, req.want);
console.log(
  JSON.stringify(
    {
      model: modelLabel(call),
      sec: Math.round((Date.now() - t0) / 1000),
      usage: call.usage,
      reply: call.output.reply,
      asked: call.output.options?.length ?? 0,
      options: r.options.map((o) => ({ shape: `${o.code} ${o.name}`, why: o.why, height: shapeDelta(spec, req.blockIndex, o.block), changed: o.changed, dropped: o.dropped })),
      dropped: r.dropped,
    },
    null,
    1,
  ),
);
