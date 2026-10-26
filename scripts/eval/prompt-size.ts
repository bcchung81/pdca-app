// 요청 입력 크기 확인(수동 실행 전용 — 호스티드 DB는 읽기만, 모델은 부르지 않음). 활성 카드 전부(주요사업·경영관리)마다 실제 요청 글을 만들어(시스템 + 공통 지식 ①~③ + 목록표 + 카드 + 요청 글) 글자 수를 셉니다.
// 과제원장 AI: 작성지원 개선 제안 · 실적 반영(붙여넣기 칸을 한도 2만 자로 채움) · 질문(앞 대화 8턴 2.4만 자와 점검표 요약 3천 자를 가정). 경평 초안(주요사업만 — 경영관리는 아직 없음): 구성안 · 집필 첫 요청(고치기 글 제외).
// 경영관리 카드는 경영관리 프롬프트 폴더(card-*-mg)와 지침 08 시스템 글로 만든다(호출부 run.ts와 같은 선택). 보완 점검·월간 점검·고치기 재호출은 재지 않음.
// 첨부는 저장본(parsed_text)이 있으면 그 글, 없으면 뺌. 토큰: 상한 검사(lib/ai/budget.ts)는 1자 = 1토큰, 실제는 약 0.95토큰/자(CLI usage 실측 34.4만 토큰/36.3만 자)라 아래 토큰 어림은 0.95배.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/prompt-size.ts
import { createClient } from "@supabase/supabase-js";
import { chatPrompt } from "../../lib/ai/chat.ts";
import { INPUT_BUDGET } from "../../lib/ai/budget.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { chatSystem, chatSystemMg, outlineSystem, reportSystem, writerSystem, writerSystemMg } from "../../lib/ai/run.ts";
import { ASSIST_TEXT_MAX, userPrompt } from "../../lib/ai/writer.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { isoDay } from "../../lib/format.ts";
import { listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { assistPrompts, assistPromptsMg, chatPrompts, chatPromptsMg, reportDraftPrompts, reportOutlinePrompts } from "../../lib/prompts/sets.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { planBlockCap } from "../../lib/reports/composition.ts";
import { blockAreaMm } from "../../lib/reports/fit.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { pickPrior } from "../../lib/reports/prior.ts";
import { loadPriorSections } from "../../lib/reports/prior-queries.ts";
import { type SiblingCard, hintSource, moduleGuide, sectionContext, sectionHints, sectionPrompt } from "../../lib/reports/section.ts";
import { storyHints, storyHintsPrompt } from "../../lib/reports/story-hints.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";

/** 실제 토큰 ÷ 글자(0단계·CLI 실측) */
const TOKENS_PER_CHAR_ACTUAL = 0.95;
/** 질문 요청의 가정: 앞 대화 8턴(cleanHistory 한도 2.4만 자)과 최종 점검표 요약 */
const CHAT_HISTORY = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: "가".repeat(3000) }));
const CHAT_INSPECTION = "가".repeat(3000);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: cards } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("status", "active").order("id");
const { data: mats } = await db.from("card_materials").select("card_id, file_name, parsed_text");
const rp = reportDraftPrompts().prompts;
const op = reportOutlinePrompts().prompts;
const sysR = reportSystem().length;
const sysO = outlineSystem(op).length;

interface Row {
  id: string;
  unit: string;
  mg: boolean;
  shared: number;
  improve: number;
  reflect: number;
  chat: number;
  outline?: number;
  report?: number;
}
const sysLen = new Map<string, number>();
const rows: Row[] = [];
for (const card of cards ?? []) {
  const mg = isMgmtCard(card.data);
  const track = trackSpecOfUnit(card.eval_unit_id);
  const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
  const files = (mats ?? []).filter((m) => m.card_id === card.id && m.parsed_text).map((m) => ({ name: m.file_name, text: m.parsed_text as string }));
  const ap = (mg ? assistPromptsMg : assistPrompts)().prompts;
  const cp = (mg ? chatPromptsMg : chatPrompts)().prompts;
  const sysW = (mg ? writerSystemMg(track) : writerSystem(track)).length;
  const sysC = (mg ? chatSystemMg(track) : chatSystem(track)).length;
  sysLen.set(mg ? "경영관리" : "주요사업", sysW);
  const shared = sharedTexts(ap, kb).join("\n\n").length;
  const ask = (mode: "improve" | "reflect", attachmentText: string | null) => userPrompt(ap, card.data, listText(ap, kb), { mode, note: "", periodLabel: "2026년 9월", attachmentText, files }).length;
  const improve = sysW + shared + ask("improve", null);
  const reflect = sysW + shared + ask("reflect", "가".repeat(ASSIST_TEXT_MAX.reflect));
  const chat = sysC + sharedTexts(cp, kb).join("\n\n").length + chatPrompt(cp, card.data, listText(cp, kb), { question: "질문 한 줄", history: CHAT_HISTORY, periodLabel: "2026년 9월", inspection: CHAT_INSPECTION, files }).length;
  const row: Row = { id: card.id, unit: card.eval_unit_id, mg, shared, improve, reflect, chat };
  if (!mg) {
    const { data: sib } = await db.from("cards").select("id, task_no, data").eq("eval_unit_id", card.eval_unit_id).eq("status", "active");
    const siblings: SiblingCard[] = (sib ?? []).map((c) => ({ id: c.id, taskNo: c.task_no, targetBusiness: c.data?.targetBusiness ?? "", executionTaskNo: c.data?.executionTaskNo ?? "", executionTask: c.data?.executionTask ?? "" }));
    const ctx = sectionContext(card.data, siblings);
    const [lens, sections, { data: rep }] = await Promise.all([
      loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }),
      loadPriorSections(db as never, card.eval_unit_id),
      db.from("reports").select("inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", 2026).maybeSingle(),
    ]);
    const actuals = yearActuals(card.data, (rep?.inputs?.kpi ?? {}) as Record<string, string>, isoDay());
    const sharedR = sharedTexts(rp, kb).join("\n\n").length;
    const section = `${listText(rp, kb)}\n\n${sectionPrompt(rp, card.data, ctx, 2026, files, pickPrior(card.data, sections), [], lens, actuals)}`;
    const task = fillFrom(op, "request", "task", { module: ctx.module, moduleGuide: moduleGuide(rp, ctx.module), area: blockAreaMm(ctx.module, ctx.head), maxBlocks: planBlockCap(ctx.module) });
    // 구성안은 틀 고르기(앱이 뽑은 틀 후보 — 2026-10-09)도 붙음
    const prior = pickPrior(card.data, sections);
    const stories = storyHintsPrompt(op, storyHints(sectionHints(card.data, prior, files, lens, actuals, 2026), hintSource(card.data, prior, files)));
    row.report = sysR + sharedR + section.length;
    row.outline = sysO + sharedR + `${section}\n\n${task}\n\n${stories}`.length;
  }
  rows.push(row);
}

const man = (chars: number) => `${((chars * TOKENS_PER_CHAR_ACTUAL) / 10_000).toFixed(1)}만`;
const stat = (rs: Row[], k: "shared" | "improve" | "reflect" | "chat" | "outline" | "report") => {
  const v = rs.map((r) => ({ n: r[k] as number, id: r.id })).sort((a, b) => a.n - b.n);
  const lo = v[0];
  const hi = v[v.length - 1];
  return `최소 ${lo.n}자(${man(lo.n)} 토큰, ${lo.id}) · 중앙 ${v[Math.floor(v.length / 2)].n} · 최대 ${hi.n}자(${man(hi.n)} 토큰, ${hi.id}) · 상한 ${INPUT_BUDGET} 넘는 카드 ${v.filter((x) => x.n > INPUT_BUDGET).length}장`;
};
const label: Array<[Parameters<typeof stat>[1], string, boolean]> = [
  ["shared", "공통 지식 ①~③", false],
  ["improve", "작성지원(개선 제안)", false],
  ["reflect", "작성지원(실적 반영, 붙여넣기 2만 자)", false],
  ["chat", "질문(앞 대화 2.4만 자)", false],
  ["outline", "경평 구성안(첫 요청)", true],
  ["report", "경평 집필(첫 요청)", true],
];
console.log(`카드 ${rows.length}장 · 토큰은 글자 × ${TOKENS_PER_CHAR_ACTUAL} 어림 · 첨부 있는 카드 ${new Set((mats ?? []).filter((m) => m.parsed_text).map((m) => m.card_id)).size}장`);
for (const mg of [false, true]) {
  const rs = rows.filter((r) => r.mg === mg);
  if (!rs.length) continue;
  console.log(`\n== ${mg ? "경영관리" : "주요사업"} ${rs.length}장 · 작성지원 시스템 ${sysLen.get(mg ? "경영관리" : "주요사업")}자${mg ? "" : ` · 경평 집필 ${sysR}자 · 구성안 ${sysO}자`}`);
  for (const [k, name, bizOnly] of label) if (!bizOnly || !mg) console.log(`${name}: ${stat(rs, k)}`);
  const units = [...new Set(rs.map((r) => r.unit))].sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  for (const unit of units) {
    const r = rs.filter((x) => x.unit === unit);
    const rep = mg ? "" : ` · 경평 집필 최대 ${Math.max(...r.map((x) => x.report ?? 0))}`;
    console.log(`  ${unit}(${r.length}장): 공통 지식 ${Math.min(...r.map((x) => x.shared))}~${Math.max(...r.map((x) => x.shared))} · 작성지원 ${Math.min(...r.map((x) => x.improve))}~${Math.max(...r.map((x) => x.improve))}${rep}`);
  }
}
