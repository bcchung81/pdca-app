// 경영관리 지표 단위 부분 「AI로 문장 채우기」 연기 시험(수동 실행 전용, 2026-10-16 R5c): 호스티드 DB에서 지표의 재료(카드 원장·과제별 초안·실적 입력·2025 보고서 조각·
// 평가위원 지적·시정조치 계획·핵심공통항목·편람)와 저장된 부분을 읽기만 하고, 요청 크기를 보이거나(--dry, AI 호출 없음) callReportUnitMg → applyUnitAiAnswer 결과를 요약합니다.
// **저장하지 않음**(DB 읽기만 — 서버 fillUnitPartsAi와 같은 요청 글·답 정리, 호출 기록 ai_requests도 남기지 않음). 운영 방식은 로컬 CLI뿐(AI_PROVIDER=cli — 2026-10-16 사용자 결정).
// 칸 글자 예산(2026-10-16): 칸마다 예산·2025 출발값과 예산 합계, 지금 글·예산대로·이번 답의 카드 밖 어림 쪽(앞·뒤 — 사업 조판과 같은 함수, 2025 대비)을 보임(--dry는 예산·지금 글까지).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-unit-mg-smoke.ts <지표 MG-N(기본 MG-8)> [--dry] [--overwrite] [--json <경로>]
//  --overwrite: 쓴 칸도 다시(기본은 빈 칸만 — 서버 기본과 같음) · --json <경로>: 요청 글·답·정리 결과를 JSON으로(비교용)
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { aiProvider, callReportUnitMg, modelLabel, reportSystem } from "../../lib/ai/run.ts";
import { reportUnitPromptsMg } from "../../lib/prompts/sets.ts";
import { type UnitAiPart, UNIT_AI_PARTS, applyUnitAiAnswer, unitAiBudgetsOf, unitAiCells, unitAiKnownNumbers, unitAiPrompt, unitAiTargets } from "../../lib/reports/unit-parts-ai.ts";
import { budgetFilledParts, linesLen, outsidePages } from "../../lib/reports/unit-parts-budget.ts";
import { freshUnitPart, readUnitPart } from "../../lib/reports/unit-parts-edit.ts";
import { type UnitPart, mgUnitPartKeys, unitWarnings } from "../../lib/reports/unit-parts-mg.ts";
import { loadUnitAiExtras, loadUnitMaterials, loadUnitPartRows } from "../../lib/reports/unit-parts-queries.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";

const flagValue = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const valued = new Set(["--json"].flatMap((f) => (process.argv.includes(f) ? [process.argv.indexOf(f) + 1] : [])));
const args = process.argv.slice(2).filter((a, i) => !a.startsWith("--") && !valued.has(i + 2));
const unit = args[0] || "MG-8";
const dry = process.argv.includes("--dry");
const overwrite = process.argv.includes("--overwrite");
const year = 2026;
const indicator = MGMT_INDICATORS.find((u) => u.id === unit);
if (!indicator) throw new Error(`경영관리 지표가 아님: ${unit}`);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const keys = mgUnitPartKeys(unit).filter((k): k is UnitAiPart => (UNIT_AI_PARTS as readonly string[]).includes(k));
if (!keys.length) throw new Error(`${unit}에는 AI 칸이 있는 부분이 없음(혁신가점 지표는 표지만)`);
const [{ materials }, stored, extras] = await Promise.all([loadUnitMaterials(db, unit, year), loadUnitPartRows(db, unit, year, keys), loadUnitAiExtras(db, unit)]);
// 서버와 같게: 저장된 부분이 있으면 그것, 없으면 재료로 만든 것
const parts: Partial<Record<UnitAiPart, UnitPart>> = {};
for (const k of keys) parts[k] = (stored.get(k) ? readUnitPart(stored.get(k)!.spec, k) : null) ?? freshUnitPart(materials, k)!.part;
const cells = unitAiCells(parts, year, unit);
const targets = unitAiTargets(cells, overwrite);
const { prompts } = reportUnitPromptsMg();
const prompt = unitAiPrompt(prompts, { materials, corrective: extras.corrective, core: extras.core, indicator: indicator.name, parts, overwrite });
const system = reportSystem(prompts);
const rows = (k: string) => new Set(targets.filter((t) => t.row.startsWith(k)).map((t) => t.row)).size;
const drafts = materials.drafts.filter((d) => d.spec).length;
console.log(
  `provider ${aiProvider()} · ${unit} ${indicator.name} · 부분 ${keys.join("·")}(저장 ${keys.filter((k) => stored.has(k)).length}) · 카드 ${materials.cards.length}장 · 과제별 초안 ${drafts}건 · 실적 입력 보고서 ${materials.kpiInputs.length}건 · 시정조치 계획 ${extras.corrective.length} · 핵심공통항목 ${extras.core.length} · ${prompts.version}`,
);
console.log(`쓸 칸 ${targets.length}개(ai 칸 ${cells.length}개, ${overwrite ? "덮어쓰기" : "빈 칸만"}) — 행: 지적 F ${rows("F")} · 전년 대비 P ${rows("P")} · 계량 K ${rows("K")} · 비계량 Q ${rows("Q")} · 개선계획 L ${rows("L")}`);
console.log(`글자 수 — 시스템 ${system.length} · 요청 ${prompt.length} · 합계 약 ${system.length + prompt.length}자`);
for (const w of unitWarnings(materials)) console.log(`지표 경고: ${w}`);
// 칸 글자 예산·어림 쪽(저장하지 않음)
const budgets = unitAiBudgetsOf({ materials, parts });
const pagesLine = (label: string, ps: Partial<Record<UnitAiPart, UnitPart>>) => {
  const o = outsidePages(ps, year, unit);
  const ch = [...o.outside.front, ...o.outside.back].map((c) => `${c.key} ${Math.round(c.mm)}mm`).join(" · ");
  return `${label}: 앞 ${o.front.pages}쪽(${Math.round(o.front.mm)}mm, 2025 ${budgets.front.pages2025}쪽) · 뒤 ${o.back.pages}쪽(${Math.round(o.back.mm)}mm, 2025 ${budgets.back.pages2025}쪽) — ${ch}`;
};
const sumOf = (list: typeof targets, f: (k: string) => number) => list.reduce((n, t) => n + f(`${t.row}|${t.field}`), 0);
console.log(`칸 예산 — 쓸 칸 ${targets.length}개 합계 ${sumOf(targets, (k) => budgets.cells[k]?.chars ?? 0)}자(2025 출발값 합 ${sumOf(targets, (k) => budgets.cells[k]?.base ?? 0)}자)`);
for (const side of ["front", "back"] as const) {
  const b = budgets[side];
  console.log(`  ${side === "front" ? "앞 장" : "뒤 장"}: 비율 ${b.scale} · 예산대로면 ${b.pages}쪽(${Math.round(b.mm)}mm) · AI 칸 비우면 ${Math.round(b.fixedMm)}mm · 2025 ${b.pages2025}쪽 안 ${b.fits ? "듦" : "못 듦(코드·사람 칸이 긺)"}`);
}
for (const c of cells) {
  const b = budgets.cells[`${c.row}|${c.field}`];
  console.log(`  ${c.row}.${c.field}\t2025 ${b.base}${b.from2025 ? "" : "(기본)"}\t예산 ${b.chars}자·${b.lines}줄\t지금 ${linesLen(c.current)}자`);
}
console.log(pagesLine("어림(지금 글)", parts));
console.log(pagesLine("어림(예산대로 채움 글)", budgetFilledParts(parts, cells, budgets) as Partial<Record<UnitAiPart, UnitPart>>));
if (dry) process.exit(0);
if (!targets.length) {
  console.log("쓸 칸이 없음 — --overwrite로 다시 쓰기");
  process.exit(0);
}
const t0 = Date.now();
const call = await callReportUnitMg(prompt);
const sec = Math.round((Date.now() - t0) / 1000);
const applied = applyUnitAiAnswer(parts, targets, call.output, unitAiKnownNumbers({ materials, core: extras.core, parts }), budgets);
const answerChars = call.output.cells.reduce((n, c) => n + linesLen(c.lines ?? []), 0);
console.log(`답 글자 ${answerChars}자(칸 ${call.output.cells.length}개) · 예산 합계 ${sumOf(targets, (k) => budgets.cells[k]?.chars ?? 0)}자`);
for (const c of call.output.cells) {
  const b = budgets.cells[`${String(c.row).replace(/[[\]\s]/g, "").toUpperCase()}|${String(c.field).trim()}`];
  console.log(`  ${c.row}.${c.field}\t답 ${linesLen(c.lines ?? [])}자·${(c.lines ?? []).length}줄\t예산 ${b ? `${b.chars}자·${b.lines}줄` : "-"}`);
}
console.log(pagesLine("어림(이번 답)", applied.parts));
const sample = (k: UnitAiPart) => {
  const p = applied.parts[k];
  if (p?.part === "findings") return p.rows.slice(0, 2).map((r) => ({ 지적: r.code.finding.join(" ").slice(0, 60), 조치: r.ai.actions }));
  if (p?.part === "prior") return p.rows.slice(0, 2).map((r) => ({ 평가내용: r.code.evalNo, now: r.ai.now, effect: r.ai.effect }));
  if (p?.part === "outcome") return { kpi: p.kpi.filter((x) => x.human.checked).slice(0, 2).map((x) => ({ name: x.code.name, analysis: x.ai.analysis })), qual: p.qual.slice(0, 1).map((x) => ({ label: x.human.label, result: x.ai.result, analysis: x.ai.analysis })), plan: p.plan.slice(0, 1).map((x) => ({ label: x.human.label, self: x.ai.self, plan: x.ai.plan })) };
  return null;
};
console.log(
  JSON.stringify(
    {
      model: modelLabel(call),
      sec,
      usage: call.usage,
      answered: call.output.cells.length,
      filled: applied.filled,
      targets: targets.length,
      unknownNumbers: applied.unknownNumbers,
      needs: applied.needs,
      notes: applied.notes,
      warnings: applied.warnings,
      sample: Object.fromEntries(keys.map((k) => [k, sample(k)])),
    },
    null,
    1,
  ),
);
const jsonOut = flagValue("--json");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ unit, year, overwrite, promptVersion: call.promptVersion, prompt, output: call.output, applied }, null, 1));
