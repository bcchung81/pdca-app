"use server";

import { callReportBlock, modelLabel } from "../../../../lib/ai/run.ts";
import { inspectionCardText } from "../../../../lib/ai/inspect.ts";
import { cardOutline } from "../../../../lib/ai/writer.ts";
import { canonicalJson } from "../../../../lib/cards/fixed.ts";
import { fitReport } from "../../../../lib/reports/fit.ts";
import { reportBlockPrompts, reportBlockPromptsMg } from "../../../../lib/prompts/sets.ts";
import { type BlockEditRequest, type ResultBox, RESULT_INDEX, applyBlockEdit, applyResultEdit, blockEditPrompt, blockShapesPrompt, checkBlock, cleanShapeOptions, readBlockEditRequest, readBlockShapesRequest, resultBoxOf, resultEditPrompt, resultUndoable, verifyBlockEdit, verifyResultEdit } from "../../../../lib/reports/block-edit.ts";
import { type ShapeRules, blockShapeCode, blockShapeName, shapeDelta, shapeRules } from "../../../../lib/reports/block-shape.ts";
import { applyDraftText, blockAt } from "../../../../lib/reports/draft-text.ts";
import type { Block, BlockOutput } from "../../../../lib/reports/blocks.ts";
import { DRAFT_TEXT_EDITS_MAX, DRAFT_TEXT_MAX } from "../../../../lib/reports/input-limits.ts";
import { readComposition } from "../../../../lib/reports/composition.ts";
import { blocksSampleHtml } from "../../../../lib/reports/section-html.ts";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../lib/auth/preview.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { type ReportSectionSpec, cleanLine, quoteFoundIn, readSection, recheckSection, sourceKey } from "../../../../lib/reports/section.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { recheckMgSection } from "../../../../lib/reports/mg-draft.ts";
import { type DraftSources, type Prepared, beginAi, logAiError, prepareDraft, refresh } from "./draft-prepare.ts";

// ---------------------------------------------------------------------------
// 블록 고치기(드래그 「AI 수정 요청」·「질문」 — lib/reports/block-edit.ts, 2026-09-27 사용자 결정 「블록 단위 · 이력은 DB · 도구줄은 수정 요청·질문」)

/** 블록 고치기 결과 — version = 저장 뒤 초안 행의 updated_at(다음 요청의 동시 편집 확인값) */
export type DraftBlockResult =
  | { ok: true; kind: "edit"; blockIndex: number; reply: string; changed: number; editId: number | null; version: string; unknown: number; message: string }
  | { ok: true; kind: "ask"; blockIndex: number; answer: string }
  | { ok: false; message: string; conflict?: boolean };

/** 판면 어림 변화(고치기 결과 글) — 예산을 넘기면 알림 */
const fitNote = (was: { total: number } | undefined, now: ReportSectionSpec["fit"] | null) =>
  !now ? "" : `, 판면 ${was?.total && was.total !== now.total ? `${was.total} → ` : ""}${now.total}/${now.budget}mm${now.total > now.budget * 1.04 ? " — 넘침, 다른 곳을 줄여 주세요" : ""}`;

/** 높이 어림 변화 글 — 주요사업 판면(예산을 넘기면 알림)·경영관리 분량(배정이 있을 때 견줌) */
const heightNote = (h: { before: number; after: number; budget: number | null }, mg: boolean) =>
  `${mg ? "분량 어림" : "판면"} ${h.before !== h.after ? `${h.before} → ` : ""}${h.after}${h.budget ? `/${h.budget}` : ""}mm${!mg && h.budget && h.after > h.budget * 1.04 ? " — 넘침, 다른 곳을 줄여 주세요" : ""}`;

/** 초안 행과 그 근거(초안을 만들 때 고른 첨부·전년 절 그대로) */
async function loadDraftForEdit(uid: string) {
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return null;
  const year = Number(currentPeriod().slice(0, 4));
  const { data: row } = await supabase.from("card_report_drafts").select("spec, updated_at, outline").eq("card_id", card.id).eq("year", year).maybeSingle();
  const spec = row?.spec ? readSection(row.spec) : null;
  if (!row || !spec || spec.version !== 3 || !spec.blocks?.length) return null;
  const sources: DraftSources = {
    card: (spec.sources ?? []).filter((x) => x.kind === "card").map((x) => x.id),
    report: (spec.sources ?? []).filter((x) => x.kind === "report").map((x) => x.id),
    prior: spec.priorKeys ?? (spec.sources ?? []).filter((x) => x.kind === "prior").map((x) => x.id),
  };
  // 구성안(있으면) — 모양 바꾸기의 근거 조건(이 과제만의 요소)을 구성안 편집과 같은 기준으로(lib/reports/block-shape.ts shapeRules)
  return { spec, version: String(row.updated_at), sources, composition: readComposition(row.outline) };
}

/** 모양 바꾸기 규칙: 트랙 + 이 과제만의 요소 근거 조건(구성안이 있으면 그 재료, 없으면 집필 때의 도식 후보) */
const rulesOf = (d: NonNullable<Awaited<ReturnType<typeof loadDraftForEdit>>>, p: Prepared): ShapeRules => shapeRules(Boolean(d.spec.mg), d.composition, p.own);

/** 인용·말풍선·우수사례·정의 원문 대조 글(초안 검증과 같은 근거) */
const quoteHay = (p: Prepared) => sourceKey(`${cardOutline(p.card.data)}\n${inspectionCardText(p.card.data)}\n${p.known}\n${p.quoteOnly}`);
/** 다시 점검(숫자 대조) — 트랙별 */
const recheck = (p: Prepared, spec: ReportSectionSpec) => (spec.mg ? recheckMgSection(spec, p.card.data, p.known, p.year, p.actuals.today) : recheckSection(spec, p.card.data, p.known, p.year, p.actuals.today));

/** 고친 초안 저장(동시 편집 보호 — 불러온 뒤 다른 곳에서 바뀌었으면 거절) + 이력 한 행 */
/** 수정 이력 한 행(블록 하나 — 추진성과(blockIndex RESULT_INDEX)면 before·after가 추진성과 칸) */
type EditLog = { blockIndex: number; kind: "edit" | "undo"; request: string; quote: string; reply: string; before: Block | ResultBox; after: Block | ResultBox; model: string | null; wasHuman: boolean; refId?: number };

async function saveEditedDraft(p: Prepared, spec: ReportSectionSpec, version: string, edit: EditLog | EditLog[] | null): Promise<{ ok: true; version: string; editId: number | null; unknown: number; fit: ReportSectionSpec["fit"] | null } | { ok: false; message: string; conflict?: boolean }> {
  const checked = recheck(p, spec);
  const { data: saved, error } = await p.supabase
    .from("card_report_drafts")
    .update({ spec: checked.spec, warnings: checked.warnings, unknown_numbers: checked.unknownNumbers })
    .eq("card_id", p.card.id)
    .eq("year", p.year)
    .eq("updated_at", version)
    .select("updated_at");
  if (error) {
    console.error("saveEditedDraft", error.message);
    return { ok: false, message: "초안을 저장하지 못했습니다(권한을 확인해 주세요)." };
  }
  if (!saved?.length) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다(다시 만들기·다른 수정). 화면을 새로 고친 뒤 다시 요청해 주세요." };
  // 블록이 아닌 글(소항목 제목·추진성과)을 직접 고친 것은 이력 행 없이(이력은 블록 단위). 여러 블록을 한 번에 고쳤으면 블록마다 한 행
  const logs = (Array.isArray(edit) ? edit : edit ? [edit] : []).map((e) => ({ card_id: p.card.id, year: p.year, block_index: e.blockIndex, kind: e.kind, request: e.request, quote: e.quote, reply: e.reply, before: e.before, after: e.after, model: e.model, was_human: e.wasHuman, ref_id: e.refId ?? null, edited_by: p.me.id }));
  if (!logs.length) return { ok: true, version: String(saved[0].updated_at), editId: null, unknown: checked.unknownNumbers.length, fit: checked.spec.fit ?? null };
  const { data: log, error: logError } = await p.supabase.from("report_draft_edits").insert(logs).select("id");
  if (logError) console.error("report_draft_edits insert", logError.message);
  return { ok: true, version: String(saved[0].updated_at), editId: log?.[0]?.id ?? null, unknown: checked.unknownNumbers.length, fit: checked.spec.fit ?? null };
}

/**
 * 블록 고치기·질문: 과제별 초안 미리보기에서 끌어 고른 글이 든 블록 하나를 담당자 요청대로 AI가 다시 씀(질문이면 답만).
 * 근거는 그 초안을 만들 때와 같음(카드 + 고른 첨부 + 전년 절 + 실사 답변). 고치기는 같은 종류 한 블록일 때만 받고(block-edit.ts verifyBlockEdit),
 * 초안을 다시 점검(recheckSection)해 저장 — version(불러온 초안 updated_at)이 지금과 다르면 거절. 이력 report_draft_edits, 호출 기록 feature = report_block.
 */
export async function runDraftBlockEdit(uid: string, raw: { blockIndex: number; kind: "edit" | "ask"; request: string; quote: string; version: string }): Promise<DraftBlockResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const d = await loadDraftForEdit(uid);
  if (!d) return { ok: false, message: "고칠 초안이 없습니다(블록 목록 초안만 고칠 수 있음). 먼저 초안을 만들어 주세요." };
  if (String(raw?.version ?? "") !== d.version) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  const req = readBlockEditRequest(raw, d.spec);
  if (typeof req === "string") return { ok: false, message: req };
  const p = await prepareDraft(uid, d.sources, { lenient: true, readOnly: req.kind === "ask" });
  if (!p.ok) return { ok: false, message: p.message };
  if (req.blockIndex === RESULT_INDEX) return runResultEdit(uid, d, p, req);
  const before = d.spec.blocks![req.blockIndex];
  const mg = Boolean(d.spec.mg);
  // 고치기는 요청이 모양을 말하면 모양도 바꿀 수 있음(2026-10-12) — 바꿀 수 있는 모양·근거 조건은 코드가 셈
  const rules = req.kind === "edit" ? rulesOf(d, p) : undefined;
  const prompt = blockEditPrompt((mg ? reportBlockPromptsMg() : reportBlockPrompts()).prompts, d.spec, req, { card: `${cardOutline(p.card.data)}\n${inspectionCardText(p.card.data)}`, extra: p.known }, rules);
  const mode = `${req.kind}+b${req.blockIndex + 1}${p.files.length ? `+${p.files.length}f` : ""}`;
  const ai = await beginAi(p, "report_block", mode);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    if (req.kind === "ask") {
      const call = await callReportBlock({ kind: "ask", prompt, kb: p.kb, mg });
      await ai.finish({ status: "ok", model: modelLabel(call), usage: call.usage, timings: { call: Date.now() - t0 } });
      return { ok: true, kind: "ask", blockIndex: req.blockIndex, answer: cleanLine(call.output.answer, 4000) || "(답이 비었습니다)" };
    }
    const call = await callReportBlock({ kind: "edit", prompt, kb: p.kb, mg });
    await ai.finish({ status: "ok", model: modelLabel(call), usage: call.usage, timings: { call: Date.now() - t0 } });
    // 인용·말풍선·우수사례·정의는 근거 원문에서 찾은 것만(초안 검증과 같은 근거), 모양을 바꿨으면 이 트랙·근거로 쓸 수 있는 모양만
    const hay = quoteHay(p);
    const v = verifyBlockEdit(before, call.output.block, cleanLine, (q) => quoteFoundIn(hay, q), rules);
    if (!v.ok) return { ok: false, message: v.message };
    if (canonicalJson(v.block) === canonicalJson(before)) return { ok: true, kind: "edit", blockIndex: req.blockIndex, reply: cleanLine(call.output.reply, 600) || "바꿀 곳이 없었습니다.", changed: 0, editId: null, version: d.version, unknown: 0, message: "AI가 블록을 바꾸지 않았습니다." };
    const next = applyBlockEdit(d.spec, req.blockIndex, v.block);
    const reply = [cleanLine(call.output.reply, 600), ...v.dropped].filter(Boolean).join(" ");
    const saved = await saveEditedDraft(p, next, d.version, { blockIndex: req.blockIndex, kind: "edit", request: req.request, quote: req.quote, reply, before, after: v.block, model: modelLabel(call), wasHuman: (d.spec.humanEdits ?? []).includes(req.blockIndex) });
    if (!saved.ok) return saved;
    refresh(uid);
    return {
      ok: true,
      kind: "edit",
      blockIndex: req.blockIndex,
      reply,
      changed: v.changed,
      editId: saved.editId,
      version: saved.version,
      unknown: saved.unknown,
      message: `${req.blockIndex + 1}번 블록을 고쳤습니다(${v.shape ? `모양 「${blockShapeName(before)}」 → 「${blockShapeName(v.block)}」, ` : ""}바뀐 글 ${v.changed}곳${fitNote(fitReport(d.spec), saved.fit)})${saved.unknown ? ` — 근거에 없는 숫자 ${saved.unknown}개(붉은 점선)를 확인해 주세요` : ""}.`,
    };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_block", e) };
  }
}

/**
 * 추진성과 상자 고치기·질문(2026-10-13 — 대상 번호 RESULT_INDEX, 주요사업 v3만: readBlockEditRequest가 경영관리·빈 상자를 거절).
 * 블록 고치기와 같은 근거·저장 경로(version 조건·다시 점검·이력 한 행 — before·after = 추진성과 칸). 고치는 것은 추진성과 줄·강조 띠(원래 있을 때만)뿐이고
 * 사람이 고친 블록 표시(humanEdits)에는 넣지 않음(추진성과 직접 고치기와 같게)
 */
async function runResultEdit(uid: string, d: NonNullable<Awaited<ReturnType<typeof loadDraftForEdit>>>, p: Prepared, req: BlockEditRequest): Promise<DraftBlockResult> {
  const prompt = resultEditPrompt(reportBlockPrompts().prompts, d.spec, req, { card: `${cardOutline(p.card.data)}\n${inspectionCardText(p.card.data)}`, extra: p.known });
  const ai = await beginAi(p, "report_block", `${req.kind}+result${p.files.length ? `+${p.files.length}f` : ""}`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    if (req.kind === "ask") {
      const call = await callReportBlock({ kind: "ask", prompt, kb: p.kb });
      await ai.finish({ status: "ok", model: modelLabel(call), usage: call.usage, timings: { call: Date.now() - t0 } });
      return { ok: true, kind: "ask", blockIndex: RESULT_INDEX, answer: cleanLine(call.output.answer, 4000) || "(답이 비었습니다)" };
    }
    const call = await callReportBlock({ kind: "result", prompt, kb: p.kb });
    await ai.finish({ status: "ok", model: modelLabel(call), usage: call.usage, timings: { call: Date.now() - t0 } });
    const before = resultBoxOf(d.spec);
    const v = verifyResultEdit(before, call.output, cleanLine);
    if (!v.ok) return { ok: false, message: v.message };
    if (canonicalJson(v.box) === canonicalJson(before)) return { ok: true, kind: "edit", blockIndex: RESULT_INDEX, reply: cleanLine(call.output.reply, 600) || "바꿀 곳이 없었습니다.", changed: 0, editId: null, version: d.version, unknown: 0, message: "AI가 추진성과를 바꾸지 않았습니다." };
    const reply = [cleanLine(call.output.reply, 600), ...v.dropped].filter(Boolean).join(" ");
    const saved = await saveEditedDraft(p, applyResultEdit(d.spec, v.box), d.version, { blockIndex: RESULT_INDEX, kind: "edit", request: req.request, quote: req.quote, reply, before, after: v.box, model: modelLabel(call), wasHuman: false });
    if (!saved.ok) return saved;
    refresh(uid);
    return {
      ok: true,
      kind: "edit",
      blockIndex: RESULT_INDEX,
      reply,
      changed: v.changed,
      editId: saved.editId,
      version: saved.version,
      unknown: saved.unknown,
      message: `추진성과를 고쳤습니다(바뀐 글 ${v.changed}곳${fitNote(fitReport(d.spec), saved.fit)})${saved.unknown ? ` — 근거에 없는 숫자 ${saved.unknown}개(붉은 점선)를 확인해 주세요` : ""}.`,
    };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_block", e) };
  }
}

// ---------------------------------------------------------------------------
// 「다른 모양으로」(2026-10-12 사용자 요구 「개별 수정안이 요청에 따라 다양한 프레임워크로」): 미리보기(AI 한 번 — 저장 안 함) → 사람이 한 안을 고르면 적용(AI 없음)

/** 대안 한 개(화면) — out은 AI 답 그대로(적용할 때 서버가 같은 검증을 다시 돌림), html은 본문과 같은 렌더러로 그린 그 블록만 */
export interface BlockShapeOption {
  code: string;
  name: string;
  why: string;
  html: string;
  out: BlockOutput;
  /** 초안 높이 어림(mm — 주요사업은 판면, 경영관리는 높이 어림) 바꾸기 전·후, 예산(경영관리 배정이 없으면 null) */
  height: { before: number; after: number; delta: number; budget: number | null };
  /** 이 안으로 바꾸면 새로 생기는 근거에 없는 숫자 */
  unknown: string[];
  /** 정리하며 뺀 것(원문을 못 찾은 인용 등) */
  dropped: string[];
}

export type BlockShapesResult =
  | { ok: true; blockIndex: number; version: string; current: { code: string; name: string; html: string }; options: BlockShapeOption[]; dropped: string[]; reply: string; model: string; mg: boolean }
  | { ok: false; message: string; conflict?: boolean };

/**
 * 「다른 모양으로」 미리보기: 고른 블록의 같은 내용을 지금과 다른 모양 2~3안으로 AI가 한 번에 씀(원하는 모양을 고르면 첫 안이 그 모양).
 * 안마다 고치기와 같은 검증(트랙·근거 조건·원문 대조 — block-edit.ts cleanShapeOptions), 높이 어림 차이, 새로 생기는 근거 없는 숫자, 미리보기 HTML. 아무것도 저장하지 않음.
 * 호출 기록 feature = report_block(블록 고치기와 같은 1분 5회·동시 2건 제한)
 */
export async function previewBlockShapes(uid: string, raw: { blockIndex: number; request?: string; want?: string | null; version: string }): Promise<BlockShapesResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const d = await loadDraftForEdit(uid);
  if (!d) return { ok: false, message: "고칠 초안이 없습니다(블록 목록 초안만 고칠 수 있음). 먼저 초안을 만들어 주세요." };
  if (String(raw?.version ?? "") !== d.version) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  // 쓰기와 같은 권한(부서는 자기 부서·잠금 아님)일 때만 — 고른 안을 적용하려면 어차피 써야 함
  const p = await prepareDraft(uid, d.sources, { lenient: true });
  if (!p.ok) return { ok: false, message: p.message };
  const rules = rulesOf(d, p);
  const req = readBlockShapesRequest(raw, d.spec, rules);
  if (typeof req === "string") return { ok: false, message: req };
  const before = d.spec.blocks![req.blockIndex];
  const mg = Boolean(d.spec.mg);
  const prompt = blockShapesPrompt((mg ? reportBlockPromptsMg() : reportBlockPrompts()).prompts, d.spec, req, { card: `${cardOutline(p.card.data)}\n${inspectionCardText(p.card.data)}`, extra: p.known }, rules);
  const ai = await beginAi(p, "report_block", `shape+b${req.blockIndex + 1}${p.files.length ? `+${p.files.length}f` : ""}`);
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const call = await callReportBlock({ kind: "shapes", prompt, kb: p.kb, mg });
    await ai.finish({ status: "ok", model: modelLabel(call), usage: call.usage, timings: { call: Date.now() - t0 } });
    const hay = quoteHay(p);
    const { options, dropped } = cleanShapeOptions(before, call.output, cleanLine, (q) => quoteFoundIn(hay, q), rules, req.want);
    const base = new Set(recheck(p, d.spec).unknownNumbers);
    return {
      ok: true,
      blockIndex: req.blockIndex,
      version: d.version,
      current: { code: blockShapeCode(before), name: blockShapeName(before), html: blocksSampleHtml([before]) },
      options: options.map((o) => ({
        code: o.code,
        name: o.name,
        why: o.why,
        html: blocksSampleHtml([o.block]),
        out: o.out,
        height: shapeDelta(d.spec, req.blockIndex, o.block),
        unknown: recheck(p, applyBlockEdit(d.spec, req.blockIndex, o.block)).unknownNumbers.filter((x) => !base.has(x)),
        dropped: o.dropped,
      })),
      dropped,
      reply: cleanLine(call.output.reply, 600),
      model: modelLabel(call),
      mg,
    };
  } catch (e) {
    return { ok: false, message: await logAiError(ai, "report_block", e) };
  }
}

/**
 * 「다른 모양으로」 적용: 미리보기에서 고른 안(AI 답 그대로)을 서버가 같은 검증으로 다시 정리해 그 블록만 바꿔 저장(AI 없음 — 호출 한도에 안 셈).
 * 블록 고치기와 같은 저장 경로(version 조건 · 다시 점검 · 사람이 고친 블록 표시 · 수정 이력 한 행 「모양 바꾸기 — …」 — 되돌리기 그대로 됨).
 * 경영관리 초안도 같은 블록 순번이라 절 자리(spec.mg.at[i])는 그대로
 */
export async function applyBlockShape(uid: string, raw: { blockIndex: number; out: BlockOutput; why?: string; request?: string; model?: string; version: string }): Promise<DraftBlockResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const d = await loadDraftForEdit(uid);
  if (!d) return { ok: false, message: "고칠 초안이 없습니다." };
  if (String(raw?.version ?? "") !== d.version) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다(다시 만들기·다른 수정). 화면을 새로 고친 뒤 다시 만들어 주세요." };
  const blockIndex = Number(raw?.blockIndex);
  const before = Number.isInteger(blockIndex) ? d.spec.blocks?.[blockIndex] : undefined;
  if (!before) return { ok: false, message: "바꿀 블록을 찾지 못했습니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  if (!raw?.out || typeof raw.out !== "object") return { ok: false, message: "고른 안이 올바르지 않습니다." };
  const p = await prepareDraft(uid, d.sources, { lenient: true });
  if (!p.ok) return { ok: false, message: p.message };
  const hay = quoteHay(p);
  const v = checkBlock(before, raw.out, cleanLine, (q) => quoteFoundIn(hay, q), rulesOf(d, p));
  if (!v.ok) return { ok: false, message: `고른 안을 쓸 수 없습니다 — ${v.reason || "칸이 모자라거나 형식이 틀림"}.` };
  if (!v.shape) return { ok: false, message: "고른 안이 지금 모양과 같습니다." };
  const next = applyBlockEdit(d.spec, blockIndex, v.block);
  const asked = cleanLine(raw.request, 600);
  const request = `모양 바꾸기 — 「${blockShapeName(before)}」 → 「${blockShapeName(v.block)}」${asked ? ` · ${asked}` : ""}`;
  const reply = [cleanLine(raw.why, 160), ...v.dropped].filter(Boolean).join(" ");
  const saved = await saveEditedDraft(p, next, d.version, { blockIndex, kind: "edit", request, quote: "", reply, before, after: v.block, model: cleanLine(raw.model, 80) || null, wasHuman: (d.spec.humanEdits ?? []).includes(blockIndex) });
  if (!saved.ok) return saved;
  refresh(uid);
  return {
    ok: true,
    kind: "edit",
    blockIndex,
    reply,
    changed: v.changed,
    editId: saved.editId,
    version: saved.version,
    unknown: saved.unknown,
    message: `${blockIndex + 1}번 블록을 「${blockShapeName(v.block)}」 모양으로 바꿨습니다(${heightNote(shapeDelta(d.spec, blockIndex, v.block), Boolean(d.spec.mg))})${saved.unknown ? ` — 근거에 없는 숫자 ${saved.unknown}개(붉은 점선)를 확인해 주세요` : ""}.`,
  };
}

/**
 * 글 직접 고치기(2026-09-28 사용자 요구 「과제원장처럼 두 번 눌러 고치기」 + 자동 저장·저장): 미리보기의 고치기 표지(data-t 경로)가 가리키는 글들을 사람이 쓴 글로 한 번에.
 * AI 없음. 블록 안 글이면 사람이 고친 블록 표시(humanEdits — 다시 만들기 경고) + 수정 이력 한 행(kind edit, request 「직접 고침」, model 없음 — 되돌리기 그대로 됨),
 * 소항목 제목·추진성과는 이력 없이. 숫자 대조는 초안과 같은 근거로 다시(사람 글도 근거에 없는 숫자면 붉은 점선). version이 지금과 다르면 거절
 */
export async function saveDraftTexts(uid: string, raw: { edits: Array<{ path: string; text: string; join?: string }>; version: string }): Promise<DraftTextsResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const d = await loadDraftForEdit(uid);
  if (!d) return { ok: false, message: "고칠 초안이 없습니다(블록 목록 초안만 고칠 수 있음)." };
  if (String(raw?.version ?? "") !== d.version) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다(다시 만들기·다른 수정). 화면을 새로 고친 뒤 다시 고쳐 주세요." };
  const edits = (Array.isArray(raw?.edits) ? raw.edits : []).slice(0, DRAFT_TEXT_EDITS_MAX);
  if (!edits.length) return { ok: true, version: d.version, changed: 0, unknown: 0, message: "저장할 변경이 없습니다." };
  // 모두 적용해 본 뒤 저장(하나라도 잘못된 경로면 저장하지 않음)
  let spec = d.spec;
  const touched = new Set<number>();
  let changed = 0;
  for (const e of edits) {
    const r = applyDraftText(spec, { path: String(e?.path ?? ""), text: cleanLine(e?.text, DRAFT_TEXT_MAX), join: e?.join || undefined });
    if (!r.ok) return { ok: false, message: r.message };
    if (!r.changed) continue;
    spec = r.spec;
    changed += 1;
    if (r.blockIndex !== null) touched.add(r.blockIndex);
  }
  if (!changed) return { ok: true, version: d.version, changed: 0, unknown: 0, message: "바뀐 글이 없습니다." };
  // 숫자 대조 근거(AI 호출 없음 — 호출 한도에 넣지 않음). 부서 잠금(제출·승인)은 prepareDraft가 막음
  const p = await prepareDraft(uid, d.sources, { lenient: true });
  if (!p.ok) return { ok: false, message: p.message };
  const blocks = [...touched].sort((a, b) => a - b);
  let next = spec;
  for (const i of blocks) next = applyBlockEdit(next, i, next.blocks![i]);
  const logs: EditLog[] = blocks.flatMap((i) => {
    const before = blockAt(d.spec, i);
    const after = blockAt(next, i);
    return before && after ? [{ blockIndex: i, kind: "edit" as const, request: "직접 고침", quote: "", reply: "", before, after, model: null, wasHuman: (d.spec.humanEdits ?? []).includes(i) }] : [];
  });
  const saved = await saveEditedDraft(p, next, d.version, logs);
  if (!saved.ok) return saved;
  refresh(uid);
  return { ok: true, version: saved.version, changed, unknown: saved.unknown, message: `저장했습니다(${changed}곳)${saved.unknown ? ` — 근거에 없는 숫자 ${saved.unknown}개(붉은 점선)를 확인해 주세요` : ""}.` };
}

/** 글 직접 고치기 결과 */
export type DraftTextsResult = { ok: true; version: string; changed: number; unknown: number; message: string } | { ok: false; message: string; conflict?: boolean };

/** 블록 고치기 되돌리기: 그 뒤 이 블록이 또 바뀌지 않았을 때만(지금 블록 = 그 고치기의 after) 고치기 전 블록으로. AI 없음, 이력에 undo 한 행 */
export async function undoDraftBlockEdit(uid: string, editId: number, version: string): Promise<DraftBlockResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const d = await loadDraftForEdit(uid);
  if (!d) return { ok: false, message: "고칠 초안이 없습니다." };
  if (String(version ?? "") !== d.version) return { ok: false, conflict: true, message: "그사이 초안이 바뀌었습니다. 화면을 새로 고친 뒤 이력에서 되돌려 주세요." };
  // 숫자 대조는 고치기와 같은 근거로(AI 호출 없음 — 호출 한도에 넣지 않음)
  const p = await prepareDraft(uid, d.sources, { lenient: true });
  if (!p.ok) return { ok: false, message: p.message };
  const { data: e } = await p.supabase.from("report_draft_edits").select("id, block_index, kind, before, after, was_human").eq("id", editId).eq("card_id", p.card.id).eq("year", p.year).maybeSingle();
  if (!e || e.kind !== "edit") return { ok: false, message: "되돌릴 고치기를 찾지 못했습니다." };
  // 추진성과(2026-10-13): 지금 추진성과 칸 = 그 고치기의 after일 때만 고치기 전 칸으로(사람이 고친 블록 표시와는 무관)
  if (e.block_index === RESULT_INDEX) {
    if (!resultUndoable(d.spec, e.after)) return { ok: false, message: "그 뒤에 추진성과가 또 바뀌어 되돌릴 수 없습니다(수정 이력에서 전후를 보고 다시 요청해 주세요)." };
    const back = e.before as ResultBox;
    const saved = await saveEditedDraft(p, applyResultEdit(d.spec, back), d.version, { blockIndex: RESULT_INDEX, kind: "undo", request: "", quote: "", reply: "", before: resultBoxOf(d.spec), after: back, model: null, wasHuman: false, refId: e.id });
    if (!saved.ok) return saved;
    refresh(uid);
    return { ok: true, kind: "edit", blockIndex: RESULT_INDEX, reply: "고치기 전 추진성과로 되돌렸습니다.", changed: 0, editId: saved.editId, version: saved.version, unknown: saved.unknown, message: "추진성과를 되돌렸습니다." };
  }
  const cur = d.spec.blocks?.[e.block_index];
  if (!cur || canonicalJson(cur) !== canonicalJson(e.after)) return { ok: false, message: "그 뒤에 이 블록이 또 바뀌어 되돌릴 수 없습니다(수정 이력에서 전후를 보고 다시 요청해 주세요)." };
  const blocks = [...d.spec.blocks!];
  blocks[e.block_index] = e.before as Block;
  // 고치기 전에 AI 글이었던 블록이면 「사람이 고친 블록」 표시도 뺌(다시 만들기 경고가 남지 않게)
  const humanEdits = e.was_human ? d.spec.humanEdits : (d.spec.humanEdits ?? []).filter((i) => i !== e.block_index);
  const next: ReportSectionSpec = { ...d.spec, blocks, humanEdits: humanEdits?.length ? humanEdits : undefined };
  const saved = await saveEditedDraft(p, next, d.version, { blockIndex: e.block_index, kind: "undo", request: "", quote: "", reply: "", before: cur, after: e.before as Block, model: null, wasHuman: true, refId: e.id });
  if (!saved.ok) return saved;
  refresh(uid);
  return { ok: true, kind: "edit", blockIndex: e.block_index, reply: "고치기 전 블록으로 되돌렸습니다.", changed: 0, editId: saved.editId, version: saved.version, unknown: saved.unknown, message: `${e.block_index + 1}번 블록을 되돌렸습니다.` };
}

/** 수정 이력 한 줄(화면) — blockIndex RESULT_INDEX(-1)면 before·after가 추진성과 칸 */
export interface DraftEditItem {
  id: number;
  blockIndex: number;
  kind: "edit" | "undo";
  request: string;
  quote: string;
  reply: string;
  before: Block | ResultBox;
  after: Block | ResultBox;
  who: string;
  at: string;
  refId: number | null;
}

/** 이 과제 초안의 블록 고치기 이력(최근 50건, 읽기는 카드를 볼 수 있는 사람 — RLS) */
export async function listDraftEdits(uid: string): Promise<DraftEditItem[]> {
  const me = await requireUser("/reports/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return [];
  const year = Number(currentPeriod().slice(0, 4));
  const { data } = await supabase.from("report_draft_edits").select("id, block_index, kind, request, quote, reply, before, after, edited_by, created_at, ref_id").eq("card_id", card.id).eq("year", year).order("created_at", { ascending: false }).limit(50);
  const ids = [...new Set((data ?? []).map((x) => x.edited_by as string))];
  // 이름은 읽을 수 있는 프로필만(부서 담당자는 자기 것만 — RLS profiles_read). 못 읽으면 「다른 사용자」
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] as Array<{ id: string; display_name: string | null; email: string | null }> };
  const nameOf = new Map((people ?? []).map((x: { id: string; display_name: string | null; email: string | null }) => [x.id, x.display_name || x.email || "—"]));
  return (data ?? []).map((x) => ({ id: x.id, blockIndex: x.block_index, kind: x.kind, request: x.request, quote: x.quote, reply: x.reply, before: x.before as Block | ResultBox, after: x.after as Block | ResultBox, who: nameOf.get(x.edited_by) ?? (x.edited_by === me.id ? "나" : "다른 사용자"), at: x.created_at, refId: x.ref_id }));
}
