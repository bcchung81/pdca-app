// 경영관리 월간 점검 AI 초안 연기 시험(수동 실행 전용): 호스티드 DB에서 카드 원장과 관리계획 발췌를 읽기만 하고
// callInspectionMg → verifyInspectionMg 결과를 보여 줍니다(점검표는 저장하지 않음).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-inspect-mg-smoke.ts [카드 id(기본 경영관리1/1-1)] [점검월 YYYY-MM] [결과 JSON 경로] [--dry]
// --dry: AI를 부르지 않고 근거 조각·체크리스트 항목·같은 지표 다른 과제의 지적 행·주요사업 연계 후보 카드(붙임4 자리)·요청 글 크기만 보여 줌(비용 없음)
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { gatherInspectionKnowledge, loadBizLedger } from "../../lib/ai/context.ts";
import { type MgSiblingRow, type MgmtInspectContext, inspectMgPrompt, mgSiblingsOf, verifyInspectionMg } from "../../lib/ai/inspect-mg.ts";
import { aiProvider, callInspectionMg, inspectMgSystem, mgLinkIndex, modelLabel } from "../../lib/ai/run.ts";
import { currentPeriod } from "../../lib/cards/view.ts";
import { isoDay } from "../../lib/format.ts";
import { pickBizLinks } from "../../lib/inspections/biz-links.ts";
import { checklistItems } from "../../lib/inspections/checklist.ts";
import { MGMT_FORM_ID, MGMT_FORM_TABLES, TABLE_KEYS, checklistCounts, checklistIntro, isPreMonth, judgeStatus, remedyText, tally } from "../../lib/inspections/model.ts";
import { inspectPromptsMg } from "../../lib/prompts/sets.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
const id = args[0] || "경영관리1/1-1";
const period = args[1] || currentPeriod();
const out = args[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const unit = MGMT_INDICATORS.find((u) => u.id === card.eval_unit_id);
if (!unit) throw new Error(`경영관리 카드가 아님: ${card.eval_unit_id}`);
const refs = await gatherInspectionKnowledge(db, card.eval_unit_id);
const items = checklistItems(refs);
// 같은 지표 과제 목록과 다른 과제의 「지적 및 개선방안」 행(원장 — 매핑표 대신, 서버 액션과 같은 mgSiblingsOf)
const sib = mgSiblingsOf(((await db.from("cards").select("id, status, no:data->>taskNo, title:data->>title, findings:data->findings").eq("eval_unit_id", card.eval_unit_id).eq("status", "active")).data ?? []) as MgSiblingRow[], card.id);
const siblings = sib.siblings;
const ctx: MgmtInspectContext = {
  period,
  today: isoDay(),
  preMonth: isPreMonth(period, currentPeriod()),
  business: null,
  subBusinesses: [],
  hasPeerCases: false,
  form: MGMT_FORM_ID,
  unit: { id: unit.id, no: unit.no, name: unit.name, bonus: unit.no >= 12 },
  siblings,
  siblingFindings: sib.findings,
  items,
  biz: pickBizLinks(card.data, await loadBizLedger(db), mgLinkIndex(), unit.id),
};
const { prompts } = inspectPromptsMg();
const prompt = inspectMgPrompt(prompts, card.data, refs, ctx);
const byType = refs.reduce<Record<string, number>>((a, r) => ({ ...a, [r.unitType]: (a[r.unitType] ?? 0) + 1 }), {});
console.log(`provider ${aiProvider()} · 카드 ${id} · 점검월 ${period} · 조각 ${refs.length}개 ${JSON.stringify(byType)} · 체크리스트 항목 ${items.length}개 · 같은 지표 과제 ${siblings.length}개 · 시스템 ${inspectMgSystem().length}자 · 요청 ${prompt.length}자`);
// 같은 지표 다른 과제의 지적 행: 카드 수·행 수·글자 수, 블록이 없을 때와 견준 요청 크기
const noSib = inspectMgPrompt(prompts, card.data, refs, { ...ctx, siblingFindings: [] }).length;
console.log(`같은 지표 다른 과제 지적 행 ${ctx.siblingFindings.length}장 · ${ctx.siblingFindings.reduce((a, s) => a + s.rows.length, 0)}행 · 요청 ${noSib}자 → ${prompt.length}자(+${prompt.length - noSib})`);
for (const s of ctx.siblingFindings) console.log(`  ${s.taskNo} ${s.title} · ${s.rows.length}행 · 지적 ${s.rows.reduce((a, x) => a + x.finding.join(" / ").length, 0)}자 · 개선방안 ${s.rows.reduce((a, x) => a + x.plan.join(" / ").length, 0)}자`);
// 붙임4 자리(원장 주요사업 카드 발췌): 고른 카드·이유·본문 글자 수, 발췌가 없을 때와 견준 요청 크기
const noBiz = inspectMgPrompt(prompts, card.data, refs, { ...ctx, biz: { ...ctx.biz, cards: [], more: [], unknownCited: [] } }).length;
console.log(`주요사업 발췌 ${ctx.biz.cards.length}장 · 색인 ${ctx.biz.indexed ? "있음" : "없음"} · 요청 ${noBiz}자 → ${prompt.length}자(+${prompt.length - noBiz})${ctx.biz.unknownCited.length ? ` · 원장에 없는 인용 ${ctx.biz.unknownCited.join(", ")}` : ""}`);
for (const c of ctx.biz.cards) console.log(`  ${c.id} [${c.reasons.join("")}] ${c.title} · ${c.dept} · ${c.asOf} · 본문 ${c.text.length}자`);
if (ctx.biz.more.length) console.log(`  상한 밖 ${ctx.biz.more.length}건: ${ctx.biz.more.map((m) => `${m.id}[${m.reasons.join("")}]`).join(" ")}`);
if (dry) process.exit(0);
const t0 = Date.now();
const call = await callInspectionMg({ card: card.data, refs, ctx });
const v = verifyInspectionMg(call.output, refs, ctx, { model: modelLabel(call), at: new Date().toISOString() });
const t = tally(v.result);
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, missing: v.missing, unverified: v.unverified, checklistMissing: v.checklistMissing, status: judgeStatus(v.result), needs: t.needs, focus: t.focus, focusNote: t.focusNote }, null, 1));
for (const k of TABLE_KEYS) {
  console.log(`\n□ ${MGMT_FORM_TABLES[k].title} — 충족 ${t.tables[k].met}/${t.tables[k].total}`);
  MGMT_FORM_TABLES[k].rows.forEach((f, i) => {
    const r = v.result[k][i];
    console.log(`${f.no} ${f.name} | ${r.judgment ?? "미판단"} | ${remedyText(k, r).replace(/\n/g, " / ")}${r.evidence.length ? ` [원문 ${r.evidence.map((e) => (e.verified ? "확인" : e.verified === false ? "다름" : "—")).join(",")}]` : ""}`);
  });
}
console.log(`\n추진현황: ${v.result.overview.status}\n개선방향:\n${v.result.overview.direction}\n사례제안: ${v.result.overview.case}\n알림: ${v.result.notices.join(" / ")}`);
console.log(`\n□ 자가진단 체크리스트 대조\n${checklistIntro(v.result.checklist)}`);
for (const r of v.result.checklist?.rows ?? []) console.log(`${r.label} | ${r.point} | ${r.result ?? "미정"} | ${r.task} | ${r.note}`);
console.log(JSON.stringify(checklistCounts(v.result.checklist)));
if (out) writeFileSync(out, JSON.stringify({ ctx: { ...ctx, items: items.length }, result: v.result, raw: call.output }, null, 1));
