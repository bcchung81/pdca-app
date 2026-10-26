"use server";

import type { HeadMode } from "../../../../lib/reports/fit.ts";

import { type OutlineCall, aiProvider, callReportOutline, callReportOutlineMg, modelLabel } from "../../../../lib/ai/run.ts";
import { specForFeature } from "../../../../lib/ai/models.ts";
import type { FollowupBasis } from "../../../../lib/ai/followup.ts";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../lib/auth/preview.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { reportLockedFor } from "../../../../lib/reports/queries.ts";
import { DRAFT_CONFLICT_MSG, saveDraftRow } from "../../../../lib/reports/draft-store.ts";
import type { Story } from "../../../../lib/reports/blocks.ts";
import { type Composition, type CompositionEdit, type CompositionOutput, type ShapeChoice, applyCompositionEdit, cleanComposition, compositionFit, compositionIssues, compositionOutSchema, fitComposition, readComposition, shapeChoices, withFixedStory } from "../../../../lib/reports/composition.ts";
import { SHEET_CSS, mgSheetHtml } from "../../../../lib/reports/composition-sheet.ts";
import { isStory, shapeName, storyLabel } from "../../../../lib/reports/frameworks.ts";
import type { MgMainStory } from "../../../../lib/reports/frameworks-mg.ts";
import { patternOf } from "../../../../lib/reports/framework-patterns.ts";
import { type ExampleItem, type FrameChoice, type FrameInput, type OutlineFrame, FRAME_REQUEST_MAX, altContext, altSignature, cleanAltChoices, cleanFrameChoice, frameLabel, isEmptyFrame, markDuplicateAlts, outlineCostUsd, outlineFrameOf } from "../../../../lib/reports/framework-pick.ts";
import { loadExampleList, loadExampleSection } from "../../../../lib/reports/example-queries.ts";
import { layoutName } from "../../../../lib/reports/layout.ts";
import { type OutlineCatalog, type OutlineView, outlineCatalog, outlineView } from "../../../../lib/reports/outline-view.ts";
import { REPORT_CSS } from "../../../../lib/reports/section-css.ts";
import { type SiblingCard, evidenceOf, sectionContext, sectionHints } from "../../../../lib/reports/section.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { type SplitSibling, splitSiblingIssues } from "../../../../lib/reports/split-axes.ts";
import type { MgDraftContext } from "../../../../lib/reports/mg-draft.ts";
import { type MgOutlineOutput, type MgPartRedo, applyMgCompositionEdit, cleanMgComposition, isMgMainStory, mgCompositionIssues, mgHintOptions, mgOutlineOutSchema, mgOverlapIssues, mgPartLabel, mgPartRedo, replaceMgPart } from "../../../../lib/reports/mg-outline.ts";
import { DRAFT_LOCKED_MSG, type DraftSources, type Prepared, type ReportDraftState, beginAi, beginAiBatch, loadInspectionBasis, loadMgSiblings, loadSplitSiblings, logAiError, prepareDraft, refresh } from "./draft-prepare.ts";
import { writeDraft } from "./draft-write.ts";

/** 구성안 경고 = 재료 대조 경고 + 같은 실행과제 형제와 다른 갈래 축·같은 칩(경고만) + 구성안 점검(판면·자료 필요) */
const outlineWarnings = (c: Composition, module: number, materialWarnings: string[], head: HeadMode = "all", splitSiblings: SplitSibling[] = []) => [...materialWarnings, ...splitSiblingIssues(c.split, splitSiblings), ...compositionIssues(c, module, head)];

/** 사람 편집의 갈래 칩 근거 글: 카드 글 + 원문을 찾은 재료 구절(만들 때의 첨부 원문은 다시 읽지 않음 — 저장된 칩은 같은 축이면 그대로 둠) */
const editHayKey = (cardData: unknown, c: Composition) => evidenceOf(cardData, c.materials.filter((m) => m.found).map((m) => m.quote).join("\n")).hayKey;

/** 요청 글(구성안 메모·절 다시 짜기 요청 — 500자) */
const requestText = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, FRAME_REQUEST_MAX) : "");
const modelOf = (oc: Pick<OutlineCall, "provider" | "model">) => (oc.provider === "cli" ? `cli/${oc.model}` : oc.model);
/** 호출 기록 mode 꼬리(고른 짜임) */
const frameTag = (f: FrameChoice) => `${f.story ? "+틀" : ""}${f.pattern ? "+패턴" : ""}${f.example ? "+예시" : ""}`;
/** 구성안에 남길 짜임 기록(고른 것이 있을 때만 — 요청 글만이면 메모가 이미 남김) */
const frameRecord = (f: FrameChoice, request: string): OutlineFrame | undefined => (isEmptyFrame(f) ? undefined : outlineFrameOf(f, request));

/** 고른 짜임의 요청 글 재료 읽기(구성 패턴은 카탈로그, 예시 절은 공통 지식 조각 — 제목은 DB 것으로 기록) */
async function frameInputOf(supabase: Prepared["supabase"], f: FrameChoice, mg: boolean): Promise<{ ok: true; input: FrameInput; frame: FrameChoice } | { ok: false; message: string }> {
  if (!f.example) return { ok: true, input: { pattern: f.pattern ? patternOf(f.pattern) : null }, frame: f };
  const example = await loadExampleSection(supabase, f.example.key, mg);
  if (!example) return { ok: false, message: "고른 2025 예시 절을 찾을 수 없습니다. 다시 골라 주세요." };
  return { ok: true, input: { pattern: f.pattern ? patternOf(f.pattern) : null, example }, frame: { ...f, example: { key: example.key, title: example.title } } };
}

/** 이 구성안을 만든 근거(승인 뒤 집필이 같은 근거를 씀) */
const sourcesOf = (p: Prepared) => ({ card: p.picked.filter((x) => x.kind === "card").map((x) => x.id), report: p.picked.filter((x) => x.kind === "report").map((x) => x.id), prior: p.prior.map((x) => x.section.key) });

/** 주요사업 구성안 한 번(AI — 저장 안 함, 기록 끝맺기는 부르는 쪽) */
const callBizOutline = (p: Prepared, inspection: FollowupBasis | null, o: { memo: string; story?: Story; frame?: FrameInput }) =>
  callReportOutline({ card: p.card.data, ctx: p.ctx, year: p.year, files: p.files, prior: p.prior, siblings: p.siblingsLayout, lens: p.lens, actuals: p.actuals, memo: o.memo, story: o.story, kb: p.kb, inspection, frame: o.frame, splitSiblings: p.splitSiblings });

/** AI 구성안(주요사업) → 저장할 구성안·경고(재료 원문 대조는 p의 근거 — 예시 절 글은 근거에 없음) */
function bizComposition(p: Prepared, out: CompositionOutput, memo: string, frame?: OutlineFrame): { composition: Composition; warnings: string[]; materialWarnings: string[] } {
  const { hayKey, known } = evidenceOf(p.card.data, p.known, p.quoteOnly);
  const cleaned = cleanComposition(out, hayKey, known);
  const composition: Composition = { ...cleaned.composition, memo, module: p.ctx.module, head: p.ctx.head, sources: sourcesOf(p), ...(frame ? { frame } : {}) };
  return { composition, warnings: outlineWarnings(composition, p.ctx.module, cleaned.warnings, p.ctx.head, p.splitSiblings), materialWarnings: cleaned.warnings };
}

/** 구성안 행 쓰기(버전 조건 — 승인했던 구성안은 다시 확인 전) */
const saveOutlineRow = (supabase: Prepared["supabase"], cardId: string, year: number, composition: Composition, warnings: string[], model: string | null, base: string | null) =>
  saveDraftRow(supabase, { cardId, year }, { outline: composition, outline_status: "draft", outline_warnings: warnings, outline_model: model, outline_at: new Date().toISOString(), outline_approved_by: null, outline_approved_at: null }, base);

/**
 * 구성안 만들기(구현 계획 2단계): 초안과 같은 근거로 재료표·핵심 메시지·평가 논점·이야기 틀·블록 목록·그림 자리를 만들고 저장(상태 draft).
 * 담당자가 보고 고친 뒤 「승인하고 집필」하면 그 짜임대로 초안을 씀. memo = 담당자 요청(만들 때·다시 만들 때), pick = 틀 갤러리에서 고른 짜임 —
 * 이야기 틀(문자열, 예전 호출) 또는 이야기 틀·구성 패턴·2025 예시 절(FrameChoice — 2026-10-12, 구성안에 frame으로 남김).
 * 호출 기록 feature = report_outline(mode 끝에 +틀·+패턴·+예시 — 고른 짜임)
 */
export async function runReportOutline(uid: string, sources?: DraftSources, memo?: string, pick?: string | FrameChoice): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const c = cleanFrameChoice(typeof pick === "string" ? { story: pick } : pick, false);
  if (!c.ok) return c;
  const p = await prepareDraft(uid, sources);
  if (!p.ok) return p;
  if (p.mg) return runReportOutlineMg({ ...p, mg: p.mg }, uid, memo);
  const { supabase, card, year, ctx } = p;
  const loaded = await frameInputOf(supabase, c.frame, false);
  if (!loaded.ok) return loaded;
  const f = loaded.frame;
  const fixed = f.story && isStory(f.story) ? f.story : undefined;
  const request = requestText(memo);
  const ai = await beginAi(p, "report_outline", `${p.mode}${frameTag(f)}`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const inspection = await loadInspectionBasis(supabase, card.id);
    const oc = await callBizOutline(p, inspection, { memo: request, story: fixed, frame: loaded.input });
    await ai.finish({ status: "ok", model: modelOf(oc), usage: oc.usage, timings: { call: Date.now() - t0 } });
    const { composition, warnings } = bizComposition(p, oc.output, request, frameRecord(f, request));
    const saved = await saveOutlineRow(supabase, card.id, year, composition, warnings, modelLabel(oc), p.base);
    if (!saved.ok) {
      if (!saved.conflict) console.error("runReportOutline save", saved.message);
      return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    }
    refresh(uid);
    const fit = compositionFit(composition, ctx.module, ctx.head);
    const label = frameLabel(f);
    return { ok: true, message: `구성안을 만들었습니다(${label ? `${label} · ` : ""}블록 ${composition.blocks.length}개 · 재료 ${composition.materials.length}개 · 판면 어림 ${fit.total}/${fit.budget}mm) — 블록마다 도식·목적·재료를 확인하고 고친 뒤 「승인하고 집필」을 눌러 주세요.` };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_outline", e) };
  }
}

/** 경영관리 구성안 만들기: 평가내용·대주제·절과 절마다 블록·재료(lib/reports/mg-outline.ts) — 호출 기록 feature = report_outline(mode mg…) */
async function runReportOutlineMg(p: Prepared & { mg: MgDraftContext }, uid: string, memo?: string): Promise<ReportDraftState> {
  const { supabase, card, year, picked, files, lens, actuals, known, quoteOnly } = p;
  const ai = await beginAi(p, "report_outline");
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    // 도식 후보(카드·첨부·추천 평가내용의 2025 절 신호 — diagramHints 경영관리 신호 포함)와 같은 지표 다른 카드의 구성안 절을 요청에 넣음
    const hints = sectionHints(card.data, [], files, lens, actuals, year, mgHintOptions(p.mg));
    const inspection = await loadInspectionBasis(supabase, card.id);
    const oc = await callReportOutlineMg({ card: card.data, ctx: p.mg, year, files, lens, actuals, memo: memo?.slice(0, 500), kb: p.kb, siblings: p.mgSiblings, hints, inspection });
    await ai.finish({ status: "ok", model: modelOf(oc), usage: oc.usage, timings: { call: Date.now() - t0 } });
    const { hayKey, known: numbers } = evidenceOf(card.data, known, quoteOnly);
    const cleaned = cleanMgComposition(oc.output, hayKey, numbers, { indicator: p.mg.indicator, prior: p.mg.prior });
    const composition: Composition = {
      ...cleaned.composition,
      memo: (memo ?? "").slice(0, 500),
      module: 1,
      head: "all",
      sources: { card: picked.filter((x) => x.kind === "card").map((x) => x.id), report: picked.filter((x) => x.kind === "report").map((x) => x.id), prior: [] },
    };
    const saved = await saveOutlineRow(supabase, card.id, year, composition, [...cleaned.warnings, ...mgOverlapIssues(composition, p.mgSiblings), ...mgCompositionIssues(composition)], modelLabel(oc), p.base);
    if (!saved.ok) {
      if (!saved.conflict) console.error("runReportOutlineMg save", saved.message);
      return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    }
    refresh(uid);
    const parts = composition.mg?.parts ?? [];
    return { ok: true, message: `구성안을 만들었습니다(평가내용 ${[...new Set(parts.map((x) => x.evalNo))].join("·") || "—"} · 절 ${parts.length}개 · 블록 ${composition.blocks.length}개 · 재료 ${composition.materials.length}개) — 절과 블록을 확인하고 고친 뒤 「승인하고 집필」을 눌러 주세요.` };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_outline", e) };
  }
}

type LoadedOutline = Extract<Awaited<ReturnType<typeof loadOutline>>, { ok: true }>;
type MgPrepared = Prepared & { mg: MgDraftContext };

/** 경영관리 절 하나 다시 짜기(AI — 저장 안 함, 기록 끝맺기는 부르는 쪽) */
function callMgPart(p: MgPrepared, inspection: FollowupBasis | null, redo: MgPartRedo, memo: string) {
  const hints = sectionHints(p.card.data, [], p.files, p.lens, p.actuals, p.year, mgHintOptions(p.mg));
  return callReportOutlineMg({ card: p.card.data, ctx: p.mg, year: p.year, files: p.files, lens: p.lens, actuals: p.actuals, kb: p.kb, siblings: p.mgSiblings, hints, inspection, part: redo, memo });
}

/** 다시 짠 절 답 → 지금 구성안에 합친 구성안·경고(replaceMgPart — 그 절 블록만 바뀜) */
function mgPartMerge(p: MgPrepared, o: LoadedOutline, out: MgOutlineOutput, key: string, story: MgMainStory | undefined, frame: OutlineFrame | undefined) {
  const { hayKey, known } = evidenceOf(p.card.data, p.known, p.quoteOnly);
  // 갈래 축은 카드 것(절 다시 짜기에서 안 바뀜) — 새 절 칩은 그 축으로 검증
  const cleaned = cleanMgComposition(out, hayKey, known, { indicator: p.mg.indicator, prior: p.mg.prior, axis: o.outline.mg?.axis ?? "" });
  const r = replaceMgPart(o.outline, cleaned.composition, key, { story, frame });
  const materialWarnings = [...o.materialWarnings, ...cleaned.warnings.filter((w) => w.startsWith("재료:"))];
  // 새 절 칩을 뺀 경고(「갈래:」)도 이번 저장 경고에
  const chipWarnings = cleaned.warnings.filter((w) => w.startsWith("갈래:"));
  return { r, newMaterialWarnings: cleaned.warnings.filter((w) => w.startsWith("재료:")), warnings: [...materialWarnings, ...chipWarnings, ...mgOverlapIssues(r.composition, o.mgSiblings), ...mgCompositionIssues(r.composition)] };
}

/**
 * 경영관리 절별 「이 틀로 다시 짜기」(2026-10-10 사용자 결정): 저장된 구성안의 절 하나를 고른 이야기 틀로 AI가 다시 짜고(callReportOutlineMg part — 다른 절 요약을 함께 보내 겹치지 않게),
 * 그 절의 블록만 바꿔 합침(replaceMgPart — 다른 절의 블록·재료·사람 편집은 그대로). 읽은 구성안 버전이 그대로일 때만 저장, 승인했던 구성안이면 다시 확인 전(draft)으로.
 * 2026-10-12: pick = 이야기 틀(문자열, 예전 호출) 또는 짜임(이야기 틀·구성 패턴·2025 예시 절 — 틀이 없으면 AI가 그 절의 틀을 고름), request = 요청 글(500자 — 짜임 지시일 뿐 근거 아님).
 * 고른 짜임은 그 절에 남김(MgPart.frame). 호출 기록 feature = report_outline(mode 끝에 +절 + 고른 짜임)
 */
export async function regenerateMgPart(uid: string, key: string, pick: string | FrameChoice, request?: string): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const c = cleanFrameChoice(typeof pick === "string" ? { story: pick } : pick, true);
  if (!c.ok) return c;
  const req = requestText(request);
  if (isEmptyFrame(c.frame) && !req) return { ok: false, message: "다시 짤 짜임(이야기 틀·구성 패턴·2025 예시 절)이나 요청 글을 골라 주세요." };
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  const loaded = await frameInputOf(o.supabase, c.frame, true);
  if (!loaded.ok) return loaded;
  const f = loaded.frame;
  const story = isMgMainStory(f.story) ? f.story : undefined;
  const redo = o.outline.mg ? mgPartRedo(o.outline, key, story, loaded.input) : null;
  if (!redo) return { ok: false, message: "구성안에 없는 절입니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  const p = await prepareDraft(uid, o.outline.sources);
  if (!p.ok) return p;
  if (!p.mg) return { ok: false, message: "경영관리 카드가 아닙니다." };
  const mp: MgPrepared = { ...p, mg: p.mg };
  const ai = await beginAi(p, "report_outline", `${p.mode}+절${frameTag(f)}`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const inspection = await loadInspectionBasis(p.supabase, p.card.id);
    const oc = await callMgPart(mp, inspection, redo, req);
    await ai.finish({ status: "ok", model: modelOf(oc), usage: oc.usage, timings: { call: Date.now() - t0 } });
    const { r, warnings } = mgPartMerge(mp, o, oc.output, key, story, outlineFrameOf(f, req));
    if (!r.changed) return { ok: false, message: r.notes.join(" ") };
    const saved = await saveOutlineRow(p.supabase, p.card.id, p.year, r.composition, warnings, modelLabel(oc), o.version);
    if (!saved.ok) {
      if (!saved.conflict) console.error("regenerateMgPart save", saved.message);
      return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    }
    refresh(uid);
    const n = r.composition.blocks.filter((b) => b.at === key).length;
    const how = story && !f.pattern && !f.example ? `「${story}」 틀로` : `고른 짜임(${frameLabel(f) || "요청 글"})으로`;
    return { ok: true, message: `「${mgPartLabel(redo.part)}」 절을 ${how} 다시 짰습니다(블록 ${n}개 — 다른 절은 그대로).${r.notes.length ? ` ${r.notes.join(" ")}` : ""} 확인하고 「승인하고 집필」을 눌러 주세요.` };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_outline", e) };
  }
}

// ---------------------------------------------------------------------------
// 다른 짜임 여러 안(2026-10-12 ③): 서로 다른 짜임 2~3개로 구성안을 한 서버 액션 안에서 동시에 한 번씩 부르고(저장 안 함) 안마다 판면·견본을 돌려줌 →
// 담당자가 하나를 고르면 그 안만 저장(adoptOutlineAlternative — 버전 조건). 주요사업은 카드 구성안 전체, 경영관리는 절 하나(절 다시 짜기와 같은 합치기).

/** 여러 안 하나의 결과(화면이 견본·판면·블록 목록을 보이고, 고르면 out을 그대로 돌려보냄) */
export interface OutlineAltView {
  no: number;
  /** 고른 짜임 이름(「AI가 다르게」 포함) */
  label: string;
  frame: FrameChoice;
  ok: boolean;
  /** 실패 이유 */
  error?: string;
  /** AI 답 그대로(고를 때 서버가 다시 정리·대조) */
  out?: unknown;
  model?: string;
  sec?: number;
  /** AI가 정한 틀(주 + 보조) */
  story?: string;
  message?: string;
  blocks?: Array<{ label: string; shape: string; layout: string }>;
  /** 판면 어림(경영관리는 0/0 — 어림하지 않음) */
  fit?: { total: number; budget: number };
  warnings?: string[];
  materials?: number;
  need?: number;
  /** 구성안 판면 견본(경영관리는 그 절만) */
  sheetHtml?: string;
  /** 앞 안과 같은 짜임이면 그 안 번호(1부터) */
  same?: number | null;
}

export type OutlineAltsResult = { ok: true; version: string | null; css: string; mg: boolean; partLabel?: string; dropped: number; alts: OutlineAltView[] } | { ok: false; message: string };

/** 여러 안 결과 공통 꼬리: 같은 짜임 표시 */
function withDuplicates(views: Array<OutlineAltView & { sig: string | null }>): OutlineAltView[] {
  const same = markDuplicateAlts(views.map((v) => v.sig));
  return views.map((v, i) => {
    const x: OutlineAltView & { sig?: string | null } = { ...v, same: same[i] === null ? null : same[i]! + 1 };
    delete x.sig;
    return x;
  });
}

const blockRows = (bs: Composition["blocks"]) => bs.map((b) => ({ label: b.label || "전폭", shape: shapeName(b.kind, b.variant), layout: layoutName(b) }));

/**
 * 다른 짜임 여러 안 만들기(저장 안 함): alts = 고른 짜임 2~3개(이야기 틀·구성 패턴·2025 예시 절·「AI가 다르게」 — 같은 짜임은 한 번만), request = 함께 보낼 요청 글,
 * sources = 근거(주요사업 — 화면이 고른 첨부·전년 절), part = 경영관리 절 열쇠(그 절만 여러 안). 진행 중 AI 호출이 없을 때만, 1분 제한에 안 수만큼 셈(beginAiBatch).
 * 안마다 호출 기록 한 행(feature report_outline, mode 끝 +N안). 실패한 안은 그 안만 실패로 돌려줌
 */
export async function runOutlineAlternatives(uid: string, raw: { alts: FrameChoice[]; request?: string; sources?: DraftSources; part?: string }): Promise<OutlineAltsResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const mg = Boolean(raw?.part);
  const ca = cleanAltChoices(raw?.alts, mg);
  if (!ca.ok) return ca;
  const request = requestText(raw?.request);
  return mg ? mgAlternatives(uid, String(raw.part), ca.alts, request, ca.dropped) : bizAlternatives(uid, raw?.sources, ca.alts, request, ca.dropped);
}

async function bizAlternatives(uid: string, sources: DraftSources | undefined, alts: FrameChoice[], request: string, dropped: number): Promise<OutlineAltsResult> {
  const p = await prepareDraft(uid, sources);
  if (!p.ok) return p;
  if (p.mg) return { ok: false, message: "경영관리 카드는 절마다 여러 안을 만듭니다 — 구성안의 절 목록에서 「짜임 고르기」를 눌러 주세요." };
  const inputs: Array<{ input: FrameInput; frame: FrameChoice }> = [];
  for (const [k, f] of alts.entries()) {
    const l = await frameInputOf(p.supabase, f, false);
    if (!l.ok) return l;
    inputs.push({ input: { ...l.input, alt: altContext(alts, k) }, frame: l.frame });
  }
  const batch = await beginAiBatch(p, "report_outline", `${p.mode}+${alts.length}안`, alts.length);
  if (!batch.ok) return { ok: false, message: batch.message };
  const inspection = await loadInspectionBasis(p.supabase, p.card.id);
  const views = await Promise.all(
    inputs.map(async ({ input, frame }, k): Promise<OutlineAltView & { sig: string | null }> => {
      const req = batch.reqs[k];
      const label = frameLabel(frame);
      const t0 = Date.now();
      try {
        const fixed = frame.story && isStory(frame.story) ? frame.story : undefined;
        const oc = await callBizOutline(p, inspection, { memo: request, story: fixed, frame: input });
        await req.finish({ status: "ok", model: modelOf(oc), usage: oc.usage, timings: { call: Date.now() - t0 } });
        const { composition, materialWarnings } = bizComposition(p, oc.output, request, frameRecord(frame, request));
        const view = outlineView(composition, p.ctx.module, p.ctx.head, materialWarnings);
        return {
          no: k + 1,
          label,
          frame,
          ok: true,
          out: oc.output,
          model: modelLabel(oc),
          sec: Math.round((Date.now() - t0) / 1000),
          story: storyLabel(composition.story, composition.subStory) || "—",
          message: composition.message,
          blocks: blockRows(composition.blocks),
          fit: view.fit,
          warnings: view.warnings,
          materials: composition.materials.length,
          need: composition.materials.filter((m) => m.kind === "need").length,
          sheetHtml: view.sheetHtml,
          sig: composition.blocks.length ? altSignature(composition.blocks, composition.story, composition.subStory) : null,
        };
      } catch (e) {
        return { no: k + 1, label, frame, ok: false, error: await logAiError(req, "report_outline", e), sig: null };
      }
    }),
  );
  return { ok: true, version: p.base, css: REPORT_CSS + SHEET_CSS, mg: false, dropped, alts: withDuplicates(views) };
}

async function mgAlternatives(uid: string, key: string, alts: FrameChoice[], request: string, dropped: number): Promise<OutlineAltsResult> {
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  const part = o.outline.mg?.parts.find((x) => x.key === key);
  if (!part) return { ok: false, message: "구성안에 없는 절입니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  const p = await prepareDraft(uid, o.outline.sources);
  if (!p.ok) return p;
  if (!p.mg) return { ok: false, message: "경영관리 카드가 아닙니다." };
  const mp: MgPrepared = { ...p, mg: p.mg };
  const redos: Array<{ redo: MgPartRedo; frame: FrameChoice; story?: MgMainStory }> = [];
  for (const [k, f0] of alts.entries()) {
    const l = await frameInputOf(p.supabase, f0, true);
    if (!l.ok) return l;
    const story = isMgMainStory(l.frame.story) ? l.frame.story : undefined;
    const redo = mgPartRedo(o.outline, key, story, { ...l.input, alt: altContext(alts, k) });
    if (!redo) return { ok: false, message: "구성안에 없는 절입니다." };
    redos.push({ redo, frame: l.frame, story });
  }
  const batch = await beginAiBatch(p, "report_outline", `${p.mode}+절+${alts.length}안`, alts.length);
  if (!batch.ok) return { ok: false, message: batch.message };
  const inspection = await loadInspectionBasis(p.supabase, p.card.id);
  const views = await Promise.all(
    redos.map(async ({ redo, frame, story }, k): Promise<OutlineAltView & { sig: string | null }> => {
      const req = batch.reqs[k];
      const label = frameLabel(frame);
      const t0 = Date.now();
      try {
        const oc = await callMgPart(mp, inspection, redo, request);
        await req.finish({ status: "ok", model: modelOf(oc), usage: oc.usage, timings: { call: Date.now() - t0 } });
        const { r, newMaterialWarnings } = mgPartMerge(mp, o, oc.output, key, story, frameRecord(frame, request) ?? (request ? { request } : undefined));
        if (!r.changed) return { no: k + 1, label, frame, ok: false, error: r.notes.join(" "), sig: null };
        // 견본·점검은 그 절만(다른 절은 지금 구성안 그대로)
        const meta = r.composition.mg!;
        const sub: Composition = { ...r.composition, blocks: r.composition.blocks.filter((b) => b.at === key), mg: { ...meta, parts: meta.parts.filter((x) => x.key === key) } };
        const np = sub.mg!.parts[0];
        return {
          no: k + 1,
          label,
          frame,
          ok: true,
          out: oc.output,
          model: modelLabel(oc),
          sec: Math.round((Date.now() - t0) / 1000),
          story: storyLabel(np?.story ?? "", np?.subStory) || "—",
          message: np?.why ?? "",
          blocks: blockRows(sub.blocks),
          fit: { total: 0, budget: 0 },
          warnings: [...newMaterialWarnings, ...mgCompositionIssues(sub)],
          materials: new Set(sub.blocks.flatMap((b) => b.materials)).size,
          need: sub.materials.filter((m) => m.kind === "need" && sub.blocks.some((b) => b.materials.includes(m.id))).length,
          sheetHtml: mgSheetHtml(sub),
          sig: altSignature(sub.blocks, np?.story ?? "", np?.subStory ?? ""),
        };
      } catch (e) {
        return { no: k + 1, label, frame, ok: false, error: await logAiError(req, "report_outline", e), sig: null };
      }
    }),
  );
  return { ok: true, version: o.version, css: REPORT_CSS + SHEET_CSS, mg: true, partLabel: mgPartLabel(part), dropped, alts: withDuplicates(views) };
}

/**
 * 여러 안 중 하나를 구성안으로(그때 저장): out = 그 안의 AI 답(화면이 받은 그대로 — 서버가 답 스키마로 다시 읽고 처음과 같은 정리·재료 원문 대조를 다시 함,
 * 근거에 없는 재료는 원문 못 찾음으로 남음), version = 여러 안을 만들 때 읽은 초안 행 버전(그사이 바뀌었으면 덮지 않음).
 * 주요사업은 구성안 전체를 바꾸고, 경영관리(part)는 그 절만 합침(replaceMgPart). 승인했던 구성안이면 다시 확인 전(draft)으로
 */
export async function adoptOutlineAlternative(uid: string, raw: { out: unknown; frame: FrameChoice; request?: string; sources?: DraftSources; part?: string; model?: string; version: string | null }): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const mg = Boolean(raw?.part);
  const c = cleanFrameChoice(raw?.frame, mg);
  if (!c.ok) return c;
  const request = requestText(raw?.request);
  const model = typeof raw?.model === "string" && raw.model.trim() ? raw.model.trim().slice(0, 80) : null;
  if (mg) {
    const key = String(raw.part);
    const o = await loadOutline(uid);
    if (!o.ok) return o;
    if (o.version !== raw.version) return { ok: false, message: DRAFT_CONFLICT_MSG };
    const parsed = mgOutlineOutSchema().safeParse(raw?.out);
    if (!parsed.success) return { ok: false, message: "고른 안을 읽지 못했습니다. 여러 안을 다시 만들어 주세요." };
    const p = await prepareDraft(uid, o.outline.sources);
    if (!p.ok) return p;
    if (!p.mg) return { ok: false, message: "경영관리 카드가 아닙니다." };
    const loaded = await frameInputOf(p.supabase, c.frame, true);
    if (!loaded.ok) return loaded;
    const f = loaded.frame;
    const story = isMgMainStory(f.story) ? f.story : undefined;
    const { r, warnings } = mgPartMerge({ ...p, mg: p.mg }, o, parsed.data, key, story, frameRecord(f, request) ?? (request ? { request } : undefined));
    if (!r.changed) return { ok: false, message: r.notes.join(" ") };
    const saved = await saveOutlineRow(p.supabase, p.card.id, p.year, r.composition, warnings, model, o.version);
    if (!saved.ok) return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
    refresh(uid);
    const part = r.composition.mg?.parts.find((x) => x.key === key);
    return { ok: true, message: `「${part ? mgPartLabel(part) : key}」 절을 고른 안(${frameLabel(f) || "AI가 다르게"})으로 바꿨습니다(블록 ${r.composition.blocks.filter((b) => b.at === key).length}개 — 다른 절은 그대로). 확인하고 「승인하고 집필」을 눌러 주세요.` };
  }
  const parsed = compositionOutSchema().safeParse(raw?.out);
  if (!parsed.success) return { ok: false, message: "고른 안을 읽지 못했습니다. 여러 안을 다시 만들어 주세요." };
  const p = await prepareDraft(uid, raw?.sources);
  if (!p.ok) return p;
  if (p.mg) return { ok: false, message: "경영관리 카드는 절마다 여러 안을 고릅니다." };
  const loaded = await frameInputOf(p.supabase, c.frame, false);
  if (!loaded.ok) return loaded;
  const f = loaded.frame;
  const fixed = f.story && isStory(f.story) ? f.story : undefined;
  const { composition, warnings } = bizComposition(p, withFixedStory(parsed.data, fixed), request, frameRecord(f, request));
  if (!composition.blocks.length) return { ok: false, message: "고른 안에 블록이 없습니다. 다른 안을 고르거나 다시 만들어 주세요." };
  const saved = await saveOutlineRow(p.supabase, p.card.id, p.year, composition, warnings, model, raw?.version ?? null);
  if (!saved.ok) return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
  refresh(uid);
  const fit = compositionFit(composition, p.ctx.module, p.ctx.head);
  return { ok: true, message: `고른 안(${frameLabel(f) || "AI가 다르게"})을 구성안으로 정했습니다(블록 ${composition.blocks.length}개 · 판면 어림 ${fit.total}/${fit.budget}mm) — 확인하고 「승인하고 집필」을 눌러 주세요.` };
}

/** 짜임 고르기 「2025 예시 절」 목록(이 카드 트랙의 2025 보고서 절 — 같은 사업·지표 먼저, 제목만) */
export async function listOutlineExamples(uid: string): Promise<{ ok: true; mg: boolean; items: ExampleItem[] } | { ok: false; message: string }> {
  await requireUser("/reports/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("eval_unit_id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const mg = String(card.eval_unit_id).startsWith("MG-");
  return { ok: true, mg, items: await loadExampleList(supabase, mg, card.eval_unit_id) };
}

/** 저장된 구성안 읽기 + 고칠 권한 확인 */
async function loadOutline(uid: string) {
  const me = await requireUser("/reports/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, data, team_id, status, eval_unit_id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false as const, message: "카드를 찾을 수 없습니다." };
  if (me.role === "dept_user" && card.team_id !== me.team?.id) return { ok: false as const, message: "자기 부서 과제만 고칠 수 있습니다." };
  const year = Number(currentPeriod().slice(0, 4));
  if (me.role === "dept_user" && (await reportLockedFor(supabase, card, year))) return { ok: false as const, message: DRAFT_LOCKED_MSG };
  const { data: row } = await supabase.from("card_report_drafts").select("outline, outline_warnings, updated_at").eq("card_id", card.id).eq("year", year).maybeSingle();
  const outline = readComposition(row?.outline);
  if (!outline || !row) return { ok: false as const, message: "구성안이 없습니다. 먼저 「구성안 만들기」를 눌러 주세요." };
  /** 읽은 행의 버전 — 고친 구성안은 이 값이 그대로일 때만 저장(saveDraftRow) */
  const version: string = row.updated_at;
  const { data: plan } = await supabase.from("report_outline").select("pages, included").eq("card_id", card.id).eq("year", year).maybeSingle();
  const { data: sib } = await supabase.from("cards").select("id, task_no, tb:data->>targetBusiness, etn:data->>executionTaskNo, et:data->>executionTask").eq("eval_unit_id", card.eval_unit_id).eq("status", "active");
  const siblings: SiblingCard[] = (sib ?? []).map((c: { id: string; task_no: string; tb: string | null; etn: string | null; et: string | null }) => ({ id: c.id, taskNo: c.task_no, targetBusiness: c.tb ?? "", executionTaskNo: c.etn ?? "", executionTask: c.et ?? "" }));
  const ctx = sectionContext(card.data, siblings, plan?.included === false ? null : plan?.pages ? Number(plan.pages) : null);
  const materialWarnings = (Array.isArray(row?.outline_warnings) ? row.outline_warnings.map(String) : []).filter((w: string) => w.startsWith("재료:"));
  // 경영관리: 같은 지표 다른 카드의 구성안 절(고친 구성안으로 겹침을 다시 셈)
  const mgSiblings = outline.mg ? await loadMgSiblings(supabase, card, year) : [];
  // 주요사업: 같은 실행과제 형제의 갈래 축·칩(고친 구성안으로 형제 축 경고를 다시 셈)
  const splitSiblings = outline.mg ? [] : await loadSplitSiblings(supabase, card, siblings, year);
  return { ok: true as const, supabase, card, year, outline, ctx, materialWarnings, mgSiblings, splitSiblings, hayKey: editHayKey(card.data, outline), version };
}

/**
 * 구성안 고치기(사람, 2026-09-28 — 블록 도식·라벨·목적·칸·재료·메모·더하기·복제·순서·빼기, 이야기 틀·그림 자리·추진성과 모양·메모),
 * 또는 「판면에 맞게 줄이기」(fitComposition — 결정론). 편집은 서버가 저장된 구성안의 재료·그림·근거 조건 안에서 다시 검증(applyCompositionEdit).
 * 승인했던 구성안을 고치면 다시 확인 전(draft)으로.
 */
export async function saveReportOutline(uid: string, change: { edit: CompositionEdit } | { fit: true }): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  if (o.outline.mg) return saveMgOutline(uid, o, change);
  const next = "fit" in change ? fitComposition(o.outline, o.ctx.module, o.ctx.head) : (() => {
    const r = applyCompositionEdit(o.outline, change.edit, undefined, o.hayKey);
    return { composition: r.composition, changes: r.notes };
  })();
  if (!next.composition.blocks.length) return { ok: false, message: "블록을 모두 뺄 수는 없습니다." };
  const saved = await saveDraftRow(o.supabase, { cardId: o.card.id, year: o.year }, { outline: next.composition, outline_status: "draft", outline_warnings: outlineWarnings(next.composition, o.ctx.module, o.materialWarnings, o.ctx.head, o.splitSiblings), outline_approved_by: null, outline_approved_at: null }, o.version);
  if (!saved.ok) return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
  refresh(uid);
  const fit = compositionFit(next.composition, o.ctx.module, o.ctx.head);
  if ("fit" in change) return { ok: true, message: next.changes.length ? `판면에 맞게 줄였습니다(${next.changes.join(" · ")}) — 어림 ${fit.total}/${fit.budget}mm.` : `줄일 곳이 없습니다 — 어림 ${fit.total}/${fit.budget}mm.` };
  return { ok: true, message: `구성안을 고쳤습니다 — 판면 어림 ${fit.total}/${fit.budget}mm.${next.changes.length ? ` 바꾸지 않은 것: ${next.changes.join(" · ")}` : ""}` };
}

/** 경영관리 구성안 고치기(절 순서·제목·이야기 틀 + 블록 편집·절 옮기기). 판면 어림이 없어 「판면에 맞게 줄이기」는 하지 않음 */
async function saveMgOutline(uid: string, o: Extract<Awaited<ReturnType<typeof loadOutline>>, { ok: true }>, change: { edit: CompositionEdit } | { fit: true }): Promise<ReportDraftState> {
  if ("fit" in change) return { ok: false, message: "경영관리 구성안은 판면을 어림하지 않습니다(판형·글자 규격 자료가 없어 분량은 목차·쪽 배정 쪽수와 견줘 경고만 합니다)." };
  const r = applyMgCompositionEdit(o.outline, change.edit, o.hayKey);
  if (!r.composition.blocks.length) return { ok: false, message: "블록을 모두 뺄 수는 없습니다." };
  const saved = await saveDraftRow(o.supabase, { cardId: o.card.id, year: o.year }, { outline: r.composition, outline_status: "draft", outline_warnings: [...o.materialWarnings, ...mgOverlapIssues(r.composition, o.mgSiblings), ...mgCompositionIssues(r.composition)], outline_approved_by: null, outline_approved_at: null }, o.version);
  if (!saved.ok) return { ok: false, message: saved.conflict ? saved.message : "구성안을 저장하지 못했습니다(권한을 확인해 주세요)." };
  refresh(uid);
  return { ok: true, message: `구성안을 고쳤습니다(절 ${r.composition.mg?.parts.length ?? 0}개 · 블록 ${r.composition.blocks.length}개).${r.notes.length ? ` 바꾸지 않은 것: ${r.notes.join(" · ")}` : ""}` };
}

/** 미리보기(저장 안 함): 편집을 적용한 구성안의 판면·예산·판면 HTML·경고 — 고치는 동안 왼쪽 구성안 판면과 블록 높이를 바로 다시 그림 */
export async function previewReportOutline(uid: string, edit: CompositionEdit): Promise<{ ok: true; view: OutlineView; notes: string[] } | { ok: false; message: string }> {
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  const r = o.outline.mg ? applyMgCompositionEdit(o.outline, edit, o.hayKey) : applyCompositionEdit(o.outline, edit, undefined, o.hayKey);
  return { ok: true, view: outlineView(r.composition, o.ctx.module, o.ctx.head, [...o.materialWarnings, ...mgOverlapIssues(r.composition, o.mgSiblings), ...splitSiblingIssues(r.composition.split, o.splitSiblings)]), notes: r.notes };
}

/** 도식 목록(블록 pos의 도식 바꾸기 또는 pos 뒤에 더하기): 모양마다 고를 수 있는지·판면 차이 */
export async function outlineShapeChoices(uid: string, edit: CompositionEdit, target: { pos: number; mode: "change" | "add" }): Promise<{ ok: true; choices: ShapeChoice[] } | { ok: false; message: string }> {
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  const pos = Math.max(0, Math.min((edit.blocks?.length ?? 1) - 1, Math.round(Number(target.pos) || 0)));
  const choices = shapeChoices(o.outline, edit, { pos, mode: target.mode === "add" ? "add" : "change" }, o.ctx.module, o.ctx.head);
  // 경영관리는 판면 어림이 없어 판면 차이를 보이지 않음(0)
  return { ok: true, choices: o.outline.mg ? choices.map((c) => ({ ...c, deltaMm: 0 })) : choices };
}

/** 틀 갤러리·도식 목록의 견본 그림(고정 — 로그인만 확인) + 여러 안 비용 어림(구성안 한 번 — 지금 모델 단가, 모르는 모델이면 null) */
export async function getOutlineCatalog(mg = false): Promise<OutlineCatalog & { altCost: number | null }> {
  await requireUser("/reports/cards");
  return { ...outlineCatalog(Boolean(mg)), altCost: outlineCostUsd(specForFeature("report_outline", aiProvider() === "api" ? "api" : "cli").model, Boolean(mg)) };
}

/** 구성안 승인하고 집필: 구성안을 만들 때 쓴 근거(첨부·전년 절)로 그 짜임대로 초안을 쓰고, 구성안을 승인(approved)으로 */
export async function approveReportOutline(uid: string): Promise<ReportDraftState> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const o = await loadOutline(uid);
  if (!o.ok) return o;
  const p = await prepareDraft(uid, o.outline.sources);
  if (!p.ok) return p;
  const r = await writeDraft(p, o.outline);
  if (r.ok) refresh(uid);
  return r;
}
