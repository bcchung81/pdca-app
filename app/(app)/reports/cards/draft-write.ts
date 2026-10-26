import "server-only";

import { callReportDraftMg, callReportSectionFitted, modelLabel } from "../../../../lib/ai/run.ts";
import { type Composition, applyPlanLayout, extraBlocks, planAdherence } from "../../../../lib/reports/composition.ts";
import { LENS_LABEL } from "../../../../lib/reports/lens.ts";
import { priorLabel } from "../../../../lib/reports/prior.ts";
import { type ReportSectionSpec, type ReportSource, verifySection } from "../../../../lib/reports/section.ts";
import { draftTimings } from "../../../../lib/ai/fix-policy.ts";
import { saveDraftRow } from "../../../../lib/reports/draft-store.ts";
import { type MgDraftContext, verifyMgDraft } from "../../../../lib/reports/mg-draft.ts";
import { mgPartLabel } from "../../../../lib/reports/mg-outline.ts";
import { type Prepared, type ReportDraftState, beginAi, logAiError } from "./draft-prepare.ts";

/** 경영관리 집필(승인된 구성안대로 한 번 — 판면 맞추기 없음): 검증 → 저장(구성안도 승인으로) */
async function writeMgDraft(p: Prepared & { mg: MgDraftContext }, plan?: Composition): Promise<ReportDraftState> {
  if (!plan?.mg) return { ok: false, message: "경영관리 초안은 「구성안 만들기」로 평가내용·대주제·절을 정하고 승인한 뒤 씁니다." };
  const { me, supabase, card, year, files, skipped, lens, actuals, known, quoteOnly } = p;
  const ai = await beginAi(p, "report_section", `${p.mode}+plan`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const call = await callReportDraftMg({ card: card.data, ctx: p.mg, year, files, lens, actuals, kb: p.kb, plan });
    // 토큰은 검증 전에 기록(검증이 예외를 던져도 쓴 토큰이 남음)
    await ai.finish({ status: "ok", model: call.provider === "cli" ? `cli/${call.model}` : call.model, usage: call.usage, timings: { call: Date.now() - t0 } });
    const v = verifyMgDraft(call.output, card.data, plan, p.mg, known, quoteOnly, year, actuals.today);
    const adherence = planAdherence(plan, v.spec.blocks ?? []);
    const warnings = [...v.warnings, ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : [])];
    if (!adherence.same) warnings.push(`구성안: 승인한 짜임 ${adherence.total}블록 중 ${adherence.matched}블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요.`);
    const evals = new Set(plan.mg.parts.map((x) => x.evalNo));
    const spec: ReportSectionSpec = {
      ...v.spec,
      plan: { story: "", matched: adherence.matched, total: adherence.total },
      sources: [
        ...files.map((x): ReportSource => ({ kind: x.kind, id: x.id, name: x.name })),
        ...p.mg.prior.filter((s) => evals.has(s.evalNo)).map((s): ReportSource => ({ kind: "prior", id: s.key, name: `2025 보고서 ${mgPartLabel(s)}` })),
        ...lens.map((x): ReportSource => ({ kind: "lens", id: x.key, name: `${LENS_LABEL[x.group]} · ${x.title}` })),
      ],
      priorKeys: [],
      promptVersion: call.promptVersion,
    };
    const row: Record<string, unknown> = { card_id: card.id, year, spec, warnings, unknown_numbers: v.unknownNumbers, model: modelLabel(call), source_rev: card.data_rev, created_by: me.id, outline: plan, outline_status: "approved", outline_approved_by: me.id, outline_approved_at: new Date().toISOString() };
    const saved = await saveDraftRow(supabase, { cardId: card.id, year }, row, p.base);
    if (!saved.ok) {
      if (!saved.conflict) console.error("writeMgDraft save", saved.message);
      return { ok: false, message: saved.conflict ? saved.message : "초안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    }
    return { ok: true, message: `승인한 구성안대로 초안을 만들었습니다(절 ${spec.mg?.parts.length ?? 0}개 · 블록 ${spec.blocks?.length ?? 0}개)${v.unknownNumbers.length ? ` — 근거에 없는 숫자 ${v.unknownNumbers.length}개(붉은 점선)를 원자료로 확인해 주세요` : ""}.` };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_section", e) };
  }
}

/** 초안 쓰기(바로 만들기·승인된 구성안으로 집필 공용): 초안 → 검증 → 판면 고치기 → 저장 */
export async function writeDraft(p: Prepared, plan?: Composition): Promise<ReportDraftState> {
  if (p.mg) return writeMgDraft({ ...p, mg: p.mg }, plan);
  const { me, supabase, card, year, files, skipped, ctx, prior, siblingsLayout, lens, actuals, known, quoteOnly, own, years } = p;
  const ai = await beginAi(p, "report_section", `${p.mode}${plan ? "+plan" : ""}`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  // 저장할 행(1차 초안 먼저 저장·최종 저장 공용) — 경고·구성안 지킴·출처·판
  const rowOf = (call: Awaited<ReturnType<typeof callReportSectionFitted>>["call"], v: Awaited<ReturnType<typeof callReportSectionFitted>>["check"], trace: Awaited<ReturnType<typeof callReportSectionFitted>>["trace"] | null) => {
    const failedFit = trace?.drafts.find((d) => d.failed);
    const warnings = [
      ...v.warnings,
      ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : []),
      // 자동 고치기(판면·올해 실적·짜임)가 실패하면 첫 초안을 그대로 저장 — 조용히 넘어가지 않고 알림(참고자료 설계 R1)
      ...(failedFit ? [`자동 고치기: 다시 쓰기 요청이 실패해 고치기 전 초안을 저장했습니다(${failedFit.error ?? "원인 모름"}) — 판면·경고를 확인해 주세요.`] : []),
      // 시간이 모자라 고치기를 건너뜀(함수 시간 제한 — lib/ai/fix-policy.ts)
      ...(trace?.skipped === "time" ? ["자동 고치기: 시간이 모자라 자동 고치기를 하지 않았습니다 — 「다시 만들기」나 블록 고치기로 판면·경고를 고쳐 주세요."] : []),
    ];
    const adherence = plan ? planAdherence(plan, v.spec.blocks ?? []) : null;
    if (plan && adherence && !adherence.same) {
      const extra = extraBlocks(plan, v.spec.blocks ?? []);
      warnings.push(
        adherence.matched === adherence.total && extra.length
          ? `구성안: 구성안 블록 ${adherence.total}개는 모두 그대로 썼지만 구성안에 없는 블록 ${extra.length}개(${extra.map((b) => b.label || b.kind).join(", ")})를 더 넣었습니다 — 판면이 넘치면 그 블록을 빼 주세요.`
          : `구성안: 승인한 짜임 ${adherence.total}블록 중 ${adherence.matched}블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요.`,
      );
    }
    const spec = {
      ...v.spec,
      // 구성안대로 쓴 초안 표시(없으면 바로 만들기) — 화면 도구줄 칩
      ...(plan && adherence ? { plan: { story: plan.story, ...(plan.subStory ? { subStory: plan.subStory } : {}), matched: adherence.matched, total: adherence.total } } : {}),
      sources: [
        ...files.map((x): ReportSource => ({ kind: x.kind, id: x.id, name: x.name })),
        ...prior.map((x): ReportSource => ({ kind: "prior", id: x.section.key, name: priorLabel(x.section) })),
        ...lens.map((x): ReportSource => ({ kind: "lens", id: x.key, name: `${LENS_LABEL[x.group]} · ${x.title}` })),
      ],
      priorKeys: prior.map((x) => x.section.key),
      promptVersion: call.promptVersion,
    };
    // 승인된 구성안으로 쓴 초안은 구성안도 승인(approved)으로 함께 저장 — 구성안 글(outline)도 같은 행에 넣음: upsert는 넣으려는 행에 CHECK를 먼저 걸어
    // outline 없이 outline_status만 주면 card_report_drafts_outline_status 제약에 걸림(2026-09-27 화면 확인에서 찾음)
    const row: Record<string, unknown> = { card_id: card.id, year, spec, warnings, unknown_numbers: v.unknownNumbers, model: modelLabel(call), source_rev: card.data_rev, created_by: me.id };
    if (plan) Object.assign(row, { outline: plan, outline_status: "approved", outline_approved_by: me.id, outline_approved_at: new Date().toISOString() });
    return row;
  };
  // 버전: 시작할 때 읽은 것 → 1차 초안을 먼저 저장하면 그 저장의 버전(고친 판은 그 위에 씀)
  let base = p.base;
  let conflict: string | null = null;
  try {
    const { call, check: v, passes, usage, trace } = await callReportSectionFitted(
      { card: card.data, ctx, year, files, prior, siblings: siblingsLayout, lens, actuals, plan, kb: p.kb },
      // 승인된 구성안의 배치(전폭·단 띠·가로 반씩)는 AI가 아니라 구성안이 정함 — 판면 어림 전에 입힘
      // 갈래 칩도 승인된 구성안에서 코드가 옮김(spec.sub.chip — 판면 어림이 칩을 붙인 제목으로 셈)
      (out) => verifySection(out, card.data, plan?.split?.chip ? { ...ctx, chip: plan.split.chip } : ctx, known, siblingsLayout, quoteOnly, year, own, plan ? (blocks) => applyPlanLayout(plan, blocks) : undefined, years, actuals.today),
      {
        // 자동 고치기 전에 1차 초안을 먼저 저장 — 고치기 도중 함수가 끊겨도 1차 초안이 남음(2026-10-10 B2a). 저장 충돌이면 고치지 않고 멈춤
        onFirst: async (first) => {
          const saved = await saveDraftRow(supabase, { cardId: card.id, year }, rowOf(first.call, first.check, null), base);
          if (saved.ok) base = saved.version;
          else if (saved.conflict) conflict = saved.message;
          else console.error("writeDraft first save", saved.message);
          return !(!saved.ok && saved.conflict);
        },
      },
    );
    const model = call.provider === "cli" ? `cli/${call.model}` : call.model;
    // 자동 고치기 횟수·1차·고치기 시간·건너뛴 이유(none·prose-only·time·stopped — 계획서 §10 E5)는 timings(mode는 시작할 때 정한 식별 값 — 고칠 수 없음)
    await ai.finish({ status: "ok", model, usage, timings: draftTimings(Date.now() - t0, passes, trace) });
    if (conflict) return { ok: false, message: conflict };
    const saved = await saveDraftRow(supabase, { cardId: card.id, year }, rowOf(call, v, trace), base);
    if (!saved.ok) {
      if (!saved.conflict) console.error("writeDraft save", saved.message);
      return { ok: false, message: saved.conflict ? saved.message : "초안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    }
    const where = files.length ? "카드·첨부 자료" : "카드";
    return {
      ok: true,
      message: `${plan ? "승인한 구성안대로 " : ""}초안을 만들었습니다${files.length || prior.length || lens.length ? `(${[files.length ? `첨부 ${files.length}건` : "", prior.length ? `전년 보고서 절 ${prior.length}개` : "", lens.length ? `평가 근거 ${lens.length}건` : ""].filter(Boolean).join(" · ")} 반영)` : ""}${v.unknownNumbers.length ? ` — ${where}에 없는 숫자 ${v.unknownNumbers.length}개(붉은 점선)를 원자료로 확인해 주세요` : ""}.`,
    };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_section", e) };
  }
}
