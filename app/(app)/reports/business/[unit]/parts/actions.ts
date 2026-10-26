"use server";

// 경평 초안 지표 단위 부분(경영관리 표지·지적사항 조치실적·전년 대비·성과분석 및 환류 — R5b 뒷단, 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.3~§3.5).
// 화면(/reports/business/<지표>/parts — 다음 작업)이 부름. 저장은 부분마다 행·버전 조건(saveUnitPartRow), 권한의 최종 판정은 RLS·가드 트리거(20261016100000).
// 읽기 = 성과관리팀·관리자 + 그 지표·연도에 보고서 행이 있는 부서 + 주관 부서, 쓰기 = 성과관리팀·관리자 + 주관 부서, 확정 = 성과관리팀 이상.
// 쓰기 액션은 맨 앞에서 부서 화면 보기 쓰기 막음(previewWriteBlocked) → 사용자 재확인 → 경영관리 지표·부분 확인. 연도는 서버가 정함(올해).
// 「AI로 문장 채우기」(fillUnitPartsAi — R5c, 설계 §3.7)는 성과관리팀 이상만, 지표당 1회 호출로 고른 부분들의 ai 칸을 채우고 시작할 때의 버전으로 저장(그사이 바뀌었으면 덮지 않음).

import { revalidatePath } from "next/cache";
import { startAiRequest } from "../../../../../../lib/ai/request-log.ts";
import { aiErrorMessage, callReportUnitMg, modelLabel } from "../../../../../../lib/ai/run.ts";
import { reportUnitPromptsMg } from "../../../../../../lib/prompts/sets.ts";
import { type UnitAiPart, applyUnitAiAnswer, isUnitAiPart, unitAiBudgetsOf, unitAiCells, unitAiKnownNumbers, unitAiPrompt, unitAiTargets, withAiWarnings } from "../../../../../../lib/reports/unit-parts-ai.ts";
import { atLeast } from "../../../../../../lib/auth/access.ts";
import { type CurrentUser, requireUser } from "../../../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../../../lib/auth/preview.ts";
import { currentPeriod } from "../../../../../../lib/cards/view.ts";
import { UNIT_PART_CONFLICT_MSG, saveUnitPartRow } from "../../../../../../lib/reports/draft-store.ts";
import { UNIT_PART_CONFIRM_MSG, UNIT_PART_LABEL, applyUnitPartEdits, freshUnitPart, mergeUnitPart, readUnitPart, refreshOutcomeWarnings } from "../../../../../../lib/reports/unit-parts-edit.ts";
import { type UnitPart, type UnitPartsMg, mgUnitPartKeys, sourceChanges, unitPartsSource, unitWarnings } from "../../../../../../lib/reports/unit-parts-mg.ts";
import { type StoredUnitPart, loadUnitAiExtras, loadUnitMaterials, loadUnitPartRows } from "../../../../../../lib/reports/unit-parts-queries.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";
import type { UnitPartKey } from "../../../../../../lib/tracks/index.ts";

/** 부분 하나(화면용) */
export interface UnitPartView {
  part: UnitPartKey;
  /** 부분 내용 — 저장된 행이 있으면 그것, 없으면 재료로 만든 초안(저장 안 됨) */
  spec: UnitPart;
  /** DB에 행이 있나(없으면 「재료로 채우기」·칸 고치기가 처음 저장) */
  saved: boolean;
  /** 버전(저장된 행의 updated_at — 다음 쓰기에 그대로 넘김). 저장 전이면 null */
  version: string | null;
  status: "draft" | "confirmed";
  warnings: string[];
  /** 「재료가 바뀜」 사유(저장할 때의 재료 판 ↔ 지금 — 저장된 행만, 없으면 빈 목록) */
  changes: string[];
  model: string | null;
  promptVersion: string | null;
  updatedAt: string | null;
}

export type UnitPartsLoadResult =
  | {
      ok: true;
      unit: string;
      indicator: string;
      year: number;
      /** 칸 고치기·다시 채우기를 보일지(성과관리팀·관리자·주관 부서) */
      canWrite: boolean;
      /** 확정·확정 풀기를 보일지(성과관리팀 이상) */
      canConfirm: boolean;
      /** 장 순서의 부분들(지표 1~11은 넷, 혁신가점은 표지만) */
      parts: UnitPartView[];
      /** 미리보기용(unitPartsHtml) — parts의 spec을 모은 것, source는 지금 재료 판 */
      view: UnitPartsMg;
      /** 부분에 매이지 않는 경고(초안 없는 카드) */
      warnings: string[];
      /** 카드 id → uid(카드·과제별 초안 주소) */
      uids: Record<string, string>;
    }
  | { ok: false; message: string };

/** version = 저장 뒤 버전(다음 쓰기에 넘김 — 바뀐 것이 없어 저장하지 않았고 행도 없으면 null) */
export type UnitPartSaveResult = { ok: true; version: string | null; changed: number; warnings: string[]; message: string } | { ok: false; message: string; conflict?: boolean };

export type UnitPartsRefillResult = { ok: true; results: Array<{ part: UnitPartKey } & UnitPartSaveResult>; message: string } | { ok: false; message: string };

const yearNow = () => Number(currentPeriod().slice(0, 4));
const pathOf = (unit: string) => `/reports/business/${encodeURIComponent(unit)}/parts`;
const refresh = (unit: string) => {
  revalidatePath(pathOf(unit));
  revalidatePath(`/reports/business/${encodeURIComponent(unit)}`);
};

/** 경영관리 지표인지(평가단위 행 — 트랙 경영관리) + 주관 부서 */
async function unitRow(supabase: Awaited<ReturnType<typeof createClient>>, unit: string): Promise<{ name: string; leadTeamId: number | null } | null> {
  if (!/^MG-\d{1,2}$/.test(String(unit ?? ""))) return null;
  const { data } = await supabase.from("eval_units").select("name, track, lead_team_id").eq("id", unit).maybeSingle();
  return data && data.track === "경영관리" ? { name: String(data.name), leadTeamId: data.lead_team_id ?? null } : null;
}

/** 쓰기 권한(서버 안내용 — 최종 판정은 RLS private.can_write_unit_parts): 성과관리팀·관리자, 주관 부서 */
const canWrite = (me: CurrentUser, leadTeamId: number | null) => atLeast(me.role, "pmo") || (leadTeamId !== null && me.team?.id === leadTeamId);

/** 저장 오류 → 화면 글(가드 트리거 문구는 그대로, 그 밖은 일반 안내 — 자세한 것은 서버 기록) */
function saveError(where: string, message: string, conflict: boolean): { ok: false; message: string; conflict?: boolean } {
  if (conflict) return { ok: false, conflict: true, message };
  console.error(where, message);
  return { ok: false, message: /성과관리팀만|바꿀 수 없습니다/.test(message) ? message : "저장하지 못했습니다(권한 또는 연결 문제) — 화면을 새로 고친 뒤 다시 해 주세요." };
}

/** 지표·부분 확인 공통(쓰기 액션) */
async function prepareWrite(unit: string, part?: UnitPartKey) {
  const me = await requireUser(pathOf(unit));
  const supabase = await createClient();
  const u = await unitRow(supabase, unit);
  if (!u) return { ok: false as const, message: "경영관리 지표가 아닙니다." };
  if (part !== undefined && !mgUnitPartKeys(unit).includes(part)) return { ok: false as const, message: "이 지표에 없는 부분입니다." };
  if (!canWrite(me, u.leadTeamId)) return { ok: false as const, message: "이 지표의 카드 밖 부분은 성과관리팀·주관 부서만 고칩니다." };
  return { ok: true as const, me, supabase, u, year: yearNow() };
}

/**
 * 부분 불러오기(읽기 — 저장 안 함): 지표의 부분마다 저장된 행(있으면 — 「재료가 바뀜」 사유 포함), 없으면 재료로 만든 초안.
 * 볼 수 있는 사람: 성과관리팀·관리자, 그 지표·연도에 보고서 행이 있는 부서, 주관 부서
 */
export async function loadUnitParts(unit: string): Promise<UnitPartsLoadResult> {
  const me = await requireUser(pathOf(unit));
  const supabase = await createClient();
  const u = await unitRow(supabase, unit);
  if (!u) return { ok: false, message: "경영관리 지표가 아닙니다." };
  const year = yearNow();
  const staff = atLeast(me.role, "pmo");
  const lead = u.leadTeamId !== null && me.team?.id === u.leadTeamId;
  if (!staff && !lead) {
    const { data: mine } = me.team ? await supabase.from("reports").select("id").eq("eval_unit_id", unit).eq("year", year).eq("team_id", me.team.id).limit(1) : { data: [] };
    if (!mine?.length) return { ok: false, message: "이 지표의 보고서를 쓰는 부서만 볼 수 있습니다." };
  }
  const [{ materials, uids }, stored] = await Promise.all([loadUnitMaterials(supabase, unit, year), loadUnitPartRows(supabase, unit, year)]);
  const now = unitPartsSource(materials);
  const parts: UnitPartView[] = [];
  for (const key of mgUnitPartKeys(unit)) {
    const row = stored.get(key);
    const spec = row ? readUnitPart(row.spec, key) : null;
    if (row && spec) {
      parts.push({ part: key, spec, saved: true, version: row.updatedAt, status: row.status, warnings: row.warnings, changes: row.source ? sourceChanges(row.source, now) : [], model: row.model, promptVersion: row.promptVersion, updatedAt: row.updatedAt });
      continue;
    }
    const fresh = freshUnitPart(materials, key)!;
    // 행은 있는데 spec 모양이 어긋남 — 새로 만든 것을 보여 주되 버전은 그 행(다시 채우기가 덮음)
    parts.push({ part: key, spec: fresh.part, saved: Boolean(row), version: row?.updatedAt ?? null, status: row?.status ?? "draft", warnings: row ? [`${UNIT_PART_LABEL[key]}: 저장된 내용을 읽지 못해 재료로 새로 만든 것을 보여 줌 — 「재료로 다시 채우기」로 저장`, ...fresh.warnings] : fresh.warnings, changes: [], model: row?.model ?? null, promptVersion: row?.promptVersion ?? null, updatedAt: row?.updatedAt ?? null });
  }
  const pick = <K extends UnitPartKey>(k: K) => (parts.find((p) => p.part === k)?.spec ?? null) as Extract<UnitPart, { part: K }> | null;
  return {
    ok: true,
    unit,
    indicator: u.name,
    year,
    canWrite: canWrite(me, u.leadTeamId),
    canConfirm: staff,
    parts,
    view: { unit, indicator: u.name, year, cover: pick("cover"), findings: pick("findings"), prior: pick("prior"), outcome: pick("outcome"), source: now },
    warnings: unitWarnings(materials),
    uids,
  };
}

/**
 * 재료로 채우기(부분마다 — versions의 열쇠가 채울 부분, 값은 화면이 가진 버전(저장 전이면 null)): 재료로 새로 만든 code 칸으로 바꾸되 저장된 ai·human 칸은 남김(mergeUnitPart),
 * 재료 판(source)·경고를 함께 저장. 확정 상태·AI 기록(model·prompt_version)은 그대로. 처음이면 insert, 버전이 다르면 그 부분만 거절(다른 부분은 저장)
 */
export async function refillUnitParts(unit: string, versions: Partial<Record<UnitPartKey, string | null>>): Promise<UnitPartsRefillResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const keys = Object.keys(versions ?? {}) as UnitPartKey[];
  if (!keys.length) return { ok: false, message: "채울 부분을 고르세요." };
  const w = await prepareWrite(unit);
  if (!w.ok) return w;
  const bad = keys.filter((k) => !mgUnitPartKeys(unit).includes(k));
  if (bad.length) return { ok: false, message: "이 지표에 없는 부분입니다." };
  const [{ materials }, stored] = await Promise.all([loadUnitMaterials(w.supabase, unit, w.year), loadUnitPartRows(w.supabase, unit, w.year, keys)]);
  const source = unitPartsSource(materials);
  const results: Array<{ part: UnitPartKey } & UnitPartSaveResult> = [];
  for (const key of keys) {
    const base = versions[key] ?? null;
    const row = stored.get(key) ?? null;
    // 화면이 본 뒤 바뀌었으면 병합하지 않음(저장 조건도 같은 버전 — 여기서 먼저 알림)
    if ((row?.updatedAt ?? null) !== base) {
      results.push({ part: key, ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG });
      continue;
    }
    const merged = mergeUnitPart(row ? readUnitPart(row.spec, key) : null, freshUnitPart(materials, key)!);
    const saved = await saveUnitPartRow(w.supabase, { evalUnitId: unit, year: w.year, part: key }, { spec: merged.part, source, warnings: merged.warnings }, base);
    results.push(saved.ok ? { part: key, ok: true, version: saved.version, changed: 1, warnings: merged.warnings, message: `${UNIT_PART_LABEL[key]}을(를) 재료로 채웠습니다.` } : { part: key, ...saveError("refillUnitParts", saved.message, saved.conflict) });
  }
  refresh(unit);
  const done = results.filter((r) => r.ok).length;
  return { ok: true, results, message: done === results.length ? `${done}개 부분을 재료로 채웠습니다.` : `${done}/${results.length}개 부분을 채웠습니다 — 나머지는 부분별 안내를 보세요.` };
}

/**
 * 칸 고치기(부분 하나): 허용 경로의 AI·사람 칸만(applyUnitPartEdits — code 칸은 거절, 하나라도 틀리면 저장 안 함). version = 화면이 가진 버전,
 * 저장 전(null)이면 재료로 만든 초안에 고친 것을 얹어 처음 저장. 성과분석이면 계량 표 경고를 고른 행으로 다시 셈
 */
export async function saveUnitPartEdits(unit: string, part: UnitPartKey, raw: { version: string | null; edits: Array<{ path: string; value: unknown }> }): Promise<UnitPartSaveResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const w = await prepareWrite(unit, part);
  if (!w.ok) return w;
  const edits = (Array.isArray(raw?.edits) ? raw.edits : []).slice(0, 60);
  const base = raw?.version ?? null;
  if (!edits.length) return { ok: true, version: base, changed: 0, warnings: [], message: "저장할 변경이 없습니다." };
  const row: StoredUnitPart | null = (await loadUnitPartRows(w.supabase, unit, w.year, [part])).get(part) ?? null;
  if ((row?.updatedAt ?? null) !== base) return { ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG };
  let current = row ? readUnitPart(row.spec, part) : null;
  let warnings = row?.warnings ?? [];
  let source = row?.source ?? null;
  if (!current) {
    // 처음 저장(또는 저장된 내용을 못 읽음): 재료로 만든 초안 위에 고침
    const { materials } = await loadUnitMaterials(w.supabase, unit, w.year);
    const fresh = freshUnitPart(materials, part)!;
    current = fresh.part;
    warnings = fresh.warnings;
    source = unitPartsSource(materials);
  }
  const applied = applyUnitPartEdits(current, edits);
  if (!applied.ok) return { ok: false, message: applied.message };
  if (!applied.changed) return { ok: true, version: base, changed: 0, warnings, message: "바뀐 칸이 없습니다." };
  if (current.part === "outcome" && applied.part.part === "outcome") warnings = refreshOutcomeWarnings(warnings, current, applied.part);
  const saved = await saveUnitPartRow(w.supabase, { evalUnitId: unit, year: w.year, part }, { spec: applied.part, warnings, ...(source ? { source } : {}) }, base);
  if (!saved.ok) return saveError("saveUnitPartEdits", saved.message, saved.conflict);
  refresh(unit);
  return { ok: true, version: saved.version, changed: applied.changed, warnings, message: `저장했습니다(${applied.changed}칸).` };
}

/** 확정·확정 풀기(성과관리팀 이상 — 주관 부서도 못 함, DB 가드 트리거도 같은 판정). 저장된 부분만, 버전 조건 */
export async function setUnitPartStatus(unit: string, part: UnitPartKey, status: "draft" | "confirmed", version: string): Promise<UnitPartSaveResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const w = await prepareWrite(unit, part);
  if (!w.ok) return w;
  if (!atLeast(w.me.role, "pmo")) return { ok: false, message: UNIT_PART_CONFIRM_MSG };
  if (status !== "draft" && status !== "confirmed") return { ok: false, message: "상태가 올바르지 않습니다." };
  if (!version) return { ok: false, message: "먼저 저장(재료로 채우기·칸 고치기)한 뒤 확정합니다." };
  const saved = await saveUnitPartRow(w.supabase, { evalUnitId: unit, year: w.year, part }, { status }, version);
  if (!saved.ok) return saveError("setUnitPartStatus", saved.message, saved.conflict);
  refresh(unit);
  return { ok: true, version: saved.version, changed: 1, warnings: [], message: status === "confirmed" ? `${UNIT_PART_LABEL[part]}을(를) 확정했습니다.` : `${UNIT_PART_LABEL[part]} 확정을 풀었습니다.` };
}

export type UnitPartsAiResult =
  | {
      ok: true;
      /** 부분마다 저장 결과(버전 충돌·채울 칸 없음 포함) */
      results: Array<{ part: UnitPartKey } & UnitPartSaveResult>;
      /** 채운 칸 수(모든 부분) */
      filled: number;
      /** 근거에 없는 숫자(모든 부분) */
      unknownNumbers: string[];
      /** 채운 글에 남은 【확인: …】 수 */
      needs: number;
      /** 부분에 매이지 않는 알림(모르는 행·거절한 칸·AI 메모) */
      notes: string[];
      message: string;
    }
  | { ok: false; message: string; conflict?: boolean };

/**
 * 「AI로 문장 채우기」(R5c — 성과관리팀 이상): versions의 열쇠 = 채울 부분(지적·전년 대비·성과분석 — 표지는 AI 칸이 없음), 값 = 화면이 가진 버전(저장 전이면 null).
 * 기본은 빈 ai 칸만, overwrite면 쓴 글도 새로. 지표당 AI 1회(lib/reports/unit-parts-ai.ts — 요청 글·답 정리·숫자 대조), 호출 기록·제한은 startAiRequest(기능 report_unit_mg).
 * 저장은 부분마다 시작할 때 읽은 버전으로(몇 분 걸리는 사이 사람이 고쳤으면 그 부분은 덮지 않고 충돌), model·prompt_version을 채움. 처음이면 재료로 만든 부분에 얹어 insert
 */
export async function fillUnitPartsAi(unit: string, versions: Partial<Record<UnitPartKey, string | null>>, opts: { overwrite?: boolean } = {}): Promise<UnitPartsAiResult> {
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const w = await prepareWrite(unit);
  if (!w.ok) return w;
  if (!atLeast(w.me.role, "pmo")) return { ok: false, message: "AI로 문장 채우기는 성과관리팀만 합니다." };
  const asked = Object.keys(versions ?? {}) as UnitPartKey[];
  if (asked.some((k) => !mgUnitPartKeys(unit).includes(k))) return { ok: false, message: "이 지표에 없는 부분입니다." };
  const keys = asked.filter(isUnitAiPart);
  if (!keys.length) return { ok: false, message: "AI로 채울 부분이 없습니다(표지는 AI 칸이 없음)." };
  const overwrite = opts?.overwrite === true;
  const [{ materials }, stored, extras] = await Promise.all([loadUnitMaterials(w.supabase, unit, w.year), loadUnitPartRows(w.supabase, unit, w.year, keys), loadUnitAiExtras(w.supabase, unit)]);
  const results: Array<{ part: UnitPartKey } & UnitPartSaveResult> = [];
  const parts: Partial<Record<UnitAiPart, UnitPart>> = {};
  const base: Partial<Record<UnitAiPart, { version: string | null; warnings: string[]; saved: boolean }>> = {};
  for (const key of keys) {
    const row = stored.get(key) ?? null;
    // 화면이 본 뒤 바뀌었으면 AI에 넣지 않음(저장 조건도 같은 버전 — 여기서 먼저 알림)
    if ((row?.updatedAt ?? null) !== (versions[key] ?? null)) {
      results.push({ part: key, ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG });
      continue;
    }
    const spec = row ? readUnitPart(row.spec, key) : null;
    const fresh = spec ? null : freshUnitPart(materials, key)!;
    parts[key] = spec ?? fresh!.part;
    base[key] = { version: row?.updatedAt ?? null, warnings: spec ? row!.warnings : fresh!.warnings, saved: Boolean(row) };
  }
  if (!Object.keys(parts).length) return { ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG };
  const targets = unitAiTargets(unitAiCells(parts, w.year, unit), overwrite);
  if (!targets.length) return { ok: false, message: overwrite ? "채울 AI 칸이 없습니다(표에 행이 없음)." : "빈 AI 칸이 없습니다 — 쓴 글을 새로 쓰려면 「덮어쓰기」를 고르세요." };
  const { prompts } = reportUnitPromptsMg();
  const prompt = unitAiPrompt(prompts, { materials, corrective: extras.corrective, core: extras.core, indicator: w.u.name, parts, overwrite });
  const ai = await startAiRequest(w.supabase, { userId: w.me.id, feature: "report_unit_mg", mode: unit });
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  let call: Awaited<ReturnType<typeof callReportUnitMg>>;
  try {
    call = await callReportUnitMg(prompt);
  } catch (e) {
    const message = aiErrorMessage(e);
    console.error("fillUnitPartsAi", e);
    await ai.finish({ status: "error", error: message });
    return { ok: false, message };
  }
  // 기록은 검증 전에 끝맺음(AI가 돌려준 토큰은 남게 — 다른 기능과 같음)
  await ai.finish({ status: "ok", model: call.provider === "cli" ? `cli/${call.model}` : call.model, usage: call.usage, timings: { call: Date.now() - t0 } });
  const known = unitAiKnownNumbers({ materials, core: extras.core, parts });
  const applied = applyUnitAiAnswer(parts, targets, call.output, known, unitAiBudgetsOf({ materials, parts }));
  const source = unitPartsSource(materials);
  let filled = 0;
  for (const key of keys) {
    const b = base[key];
    const spec = applied.parts[key];
    if (!b || !spec) continue;
    const n = applied.filled[key] ?? 0;
    if (!targets.some((t) => t.part === key)) {
      results.push({ part: key, ok: true, version: b.version, changed: 0, warnings: b.warnings, message: `${UNIT_PART_LABEL[key]}: 채울 빈 칸이 없습니다.` });
      continue;
    }
    const warnings = withAiWarnings(b.warnings, applied.warnings[key] ?? []);
    const saved = await saveUnitPartRow(w.supabase, { evalUnitId: unit, year: w.year, part: key }, { spec, warnings, model: modelLabel(call), prompt_version: call.promptVersion, ...(b.saved ? {} : { source }) }, b.version);
    if (!saved.ok) {
      results.push({ part: key, ...saveError("fillUnitPartsAi", saved.message, saved.conflict) });
      continue;
    }
    filled += n;
    results.push({ part: key, ok: true, version: saved.version, changed: n, warnings, message: `${UNIT_PART_LABEL[key]}: ${n}칸을 채웠습니다.` });
  }
  refresh(unit);
  const failed = results.filter((r) => !r.ok).length;
  const tail = [applied.unknownNumbers.length ? `없는 숫자 ${applied.unknownNumbers.length}개` : "", applied.needs ? `【확인】 ${applied.needs}곳` : ""].filter(Boolean).join(" · ");
  return {
    ok: true,
    results,
    filled,
    unknownNumbers: applied.unknownNumbers,
    needs: applied.needs,
    notes: applied.notes,
    message: `AI가 ${filled}칸을 채웠습니다${tail ? ` — ${tail}(부분의 「확인할 것」)` : ""}.${failed ? ` ${failed}개 부분은 저장하지 못함 — 부분별 안내를 보세요.` : ""}`,
  };
}
