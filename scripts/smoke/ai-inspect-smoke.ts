// 월간 점검 AI 초안 연기 시험(수동 실행 전용): 호스티드 DB에서 카드 원장과 관리계획 발췌를 읽기만 하고
// callInspection → verifyInspection 결과를 보여 줍니다(점검표는 저장하지 않음).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-inspect-smoke.ts [카드 id(기본 주요사업1/1-가)] [점검월 YYYY-MM] [결과 JSON 경로] [--fake-peer]
// --fake-peer: 붙임2 사례 경로 시험용 가상 사례 3행을 메모리에서만 더함(DB에 넣지 않음, 실제 기관 자료 아님)
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { gatherInspectionKnowledge } from "../../lib/ai/context.ts";
import { type InspectContext, inspectionPrompt, verifyInspection } from "../../lib/ai/inspect.ts";
import { aiProvider, callInspection, modelLabel } from "../../lib/ai/run.ts";
import { inspectPrompts } from "../../lib/prompts/sets.ts";
import { currentPeriod } from "../../lib/cards/view.ts";
import { isoDay } from "../../lib/format.ts";
import { FORM_TABLES, TABLE_KEYS, isPreMonth, judgeStatus, remedyText, tally } from "../../lib/inspections/model.ts";
import { BUSINESSES } from "../../lib/knowledge/dictionaries.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const fakePeer = process.argv.includes("--fake-peer");
const id = args[0] || "주요사업1/1-가";
const period = args[1] || currentPeriod();
const out = args[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const refs = await gatherInspectionKnowledge(db, card.eval_unit_id);
if (fakePeer)
  refs.push(
    ...[
      ["가상기관A", "시험 대국민 안전 서비스 사업", "B+", "현장 안전 데이터를 수집해 사고 건수 감소를 전년 대비 수치로 입증하고, 성과를 전국 지사 표준 절차로 확산함", "성과지표가 투입 지표 위주"],
      ["가상기관B", "시험 산업 지원 사업", "B0", "민간 협의체와 공동 분석으로 제도 개선까지 연결하고 개선 효과를 이용자 만족도로 측정함", "확산 로드맵 부족"],
      ["한국방송통신전파진흥원", "전파이용 기회 확대 사업", "C", "", "내부 업무 효율성 향상에 치중"],
    ].map(([org, business, grade, good, bad], i) => ({
      key: `peer25-biz/${String(i + 1).padStart(3, "0")}`,
      title: `붙임2 · ${org} — ${business}(${grade})`,
      unitType: "peer_case",
      text: [good ? `잘한 점(성과): ${good}` : "", `아쉬운 점(지적사항): ${bad}`].filter(Boolean).join("\n\n"),
      where: "시험용 가상 자료",
      meta: { org, business, grade, kind: "기관", kca: org === "한국방송통신전파진흥원" },
    })),
  );
const biz = BUSINESSES.find((b) => b.id === card.eval_unit_id && b.cardGroup);
const ctx: InspectContext = {
  period,
  today: isoDay(),
  preMonth: isPreMonth(period, currentPeriod()),
  business: biz ? { id: biz.id, name2026: biz.name2026, name2025: biz.name2025 } : null,
  subBusinesses: [...new Set(((await db.from("cards").select("tb:data->>targetBusiness").eq("eval_unit_id", card.eval_unit_id).eq("status", "active")).data ?? []).map((r: { tb: string | null }) => r.tb ?? "").filter(Boolean))],
  hasPeerCases: refs.some((r) => r.unitType === "peer_case"),
};
const prompt = inspectionPrompt(inspectPrompts().prompts, card.data, refs, ctx);
console.log(`provider ${aiProvider()} · 카드 ${id} · 점검월 ${period} · 조각 ${refs.length}개 · 요청 ${prompt.length}자`);
const t0 = Date.now();
const call = await callInspection({ card: card.data, refs, ctx });
const v = verifyInspection(call.output, refs, ctx, { model: modelLabel(call), at: new Date().toISOString() });
const t = tally(v.result);
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, missing: v.missing, unverified: v.unverified, status: judgeStatus(v.result), needs: t.needs, focus: t.focus, focusNote: t.focusNote }, null, 1));
for (const k of TABLE_KEYS) {
  console.log(`\n□ ${FORM_TABLES[k].title} — 충족 ${t.tables[k].met}/${t.tables[k].total}`);
  FORM_TABLES[k].rows.forEach((f, i) => {
    const r = v.result[k][i];
    console.log(`${f.no} ${f.name} | ${r.judgment ?? "미판단"} | ${remedyText(k, r).replace(/\n/g, " / ")}${r.evidence.length ? ` [원문 ${r.evidence.map((e) => (e.verified ? "확인" : e.verified === false ? "다름" : "—")).join(",")}]` : ""}`);
  });
}
console.log(`\n추진현황: ${v.result.overview.status}\n개선방향:\n${v.result.overview.direction}\n사례제안: ${v.result.overview.case}\n알림: ${v.result.notices.join(" / ")}`);
if (out) writeFileSync(out, JSON.stringify({ ctx, result: v.result, raw: call.output }, null, 1));
