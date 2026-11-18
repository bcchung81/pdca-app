// 과제원장 「이 시점으로 되돌리기」의 판정·문구(입출력 없는 순수 로직). 서버 액션 revertCard·이력 조회 getCardHistory(app/(app)/cards/actions.ts)가 같이 씀.
// 2026-11-18 사용자 결정(.team/VER.md):
//  1) 카드 내용(cards.data)만 되돌림 — 원본 배치·팀·본부·판·단계·고정 잠금은 그대로
//  2) 원본 배치를 바꾸는 한글 현행화보다 앞 시점으로는 막음(배치 이력이 없어 화면·한글 내려받기가 어긋날 수 있음)
// 되돌린 일도 card_edits에 새 행(요약 「되돌림: …」)으로 남아 다시 되돌릴 수 있고, 30분 합치기에 섞이지 않음(historyMergeable).

import type { LooseJson } from "../loose-json.ts";
import { checkEditable, recomputeDerived } from "./edit.ts";
import { canonicalJson } from "./fixed.ts";

/** 한글 현행화 반영 이력의 요약 앞머리(app/(app)/cards/import/actions.ts applyToLedger — `현행화: <파일> (<구역>)`) */
export const SYNC_PREFIX = "현행화:";
/** 되돌림 이력의 요약 앞머리 */
export const REVERT_PREFIX = "되돌림:";
/** 원장 자동 저장 이력의 요약 앞머리(saveCard — `내용·운영 값(단계·진도율%·상태)`) */
export const AUTOSAVE_SUMMARY = "내용·운영 값";
/** 같은 사람이 이 시간 안에 이어 고치면 이력 한 행으로 합침 */
export const HISTORY_MERGE_MS = 30 * 60 * 1000;

/** after = 그 수정 직후 내용으로, before = 그 수정 전 내용으로 */
export type RevertSide = "after" | "before";
export const REVERT_SIDES: readonly RevertSide[] = ["after", "before"];

/** 막는 까닭: same = 지금 내용과 같음(화면은 단추를 안 그림), 나머지는 단추를 흐리게 + 까닭 */
export type RevertBlock = "same" | "sync" | "empty" | "retired" | "identity" | "invalid";

export interface EditPoint {
  id: number;
  /** 이력 시각(edited_at — 합친 행은 마지막 저장 시각) */
  at: string;
  summary: string | null;
  before: LooseJson;
  after: LooseJson;
}

export type RevertPlan = { ok: true; data: LooseJson; summary: string } | { ok: false; code: RevertBlock; reason: string };

const REASON: Record<Exclude<RevertBlock, "invalid">, string> = {
  same: "지금 내용과 같습니다.",
  sync: "이 시점 뒤에 한글 현행화가 있어 되돌릴 수 없습니다(원본 배치가 바뀌었을 수 있음).",
  empty: "새 과제 등록 전이라 되돌릴 내용이 없습니다.",
  retired: "보관한(삭제한) 과제는 되돌릴 수 없습니다. 보관함에서 되살린 뒤 되돌려 주세요.",
  identity: "그 시점의 과제 식별 값(id·group·taskNo)이 지금과 달라 되돌릴 수 없습니다.",
};

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** 서울 시각 「2026-11-18 14:05」 */
export function kstStamp(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** 되돌림 이력 요약: after면 「되돌림: 2026-11-18 14:05 시점(이력 #12)」, before면 「되돌림: 2026-11-18 14:05 수정 전(이력 #12)」 */
export function revertSummary(pick: Pick<EditPoint, "id" | "at">, side: RevertSide): string {
  return `${REVERT_PREFIX} ${kstStamp(pick.at)} ${side === "after" ? "시점" : "수정 전"}(이력 #${pick.id})`;
}

/**
 * 고른 이력 행(pick)의 한쪽(side) 내용으로 원장을 되돌려도 되나 + 쓸 내용.
 * later = pick보다 뒤의 이력 행(요약만 봄). before 쪽은 pick 자신도 「고른 시점 뒤」의 수정이라 함께 봄.
 * 판정 순서: 보관 → 빈 내용(새 과제 등록 전) → 현행화 뒤 시점 → 식별 값 → 구역 구조(checkEditable) → 지금과 같음
 */
export function planRevert(pick: EditPoint, side: RevertSide, later: readonly { summary: string | null }[], current: { data: LooseJson; retired?: boolean }): RevertPlan {
  const block = (code: Exclude<RevertBlock, "invalid">): RevertPlan => ({ ok: false, code, reason: REASON[code] });
  if (current.retired) return block("retired");
  const target = pick[side];
  if (!isObject(target) || !Object.keys(target).length) return block("empty");
  const afterPoint = side === "before" ? [pick, ...later] : later;
  if (afterPoint.some((r) => String(r.summary ?? "").startsWith(SYNC_PREFIX))) return block("sync");
  const now = current.data ?? {};
  if (["id", "group", "taskNo"].some((k) => target[k] !== now[k])) return block("identity");
  const data = recomputeDerived(target);
  const problem = checkEditable(now, data);
  if (problem) return { ok: false, code: "invalid", reason: `그 시점 내용을 원장에 쓸 수 없습니다(${problem}).` };
  if (canonicalJson(data) === canonicalJson(now)) return block("same");
  return { ok: true, data, summary: revertSummary(pick, side) };
}

/**
 * 원장 저장(saveCard)의 이력 합치기 조건: 가장 최근 이력 행이 같은 사람의 자동 저장 행이고 30분 안이면 그 행의 after만 갱신.
 * 되돌림·현행화·작성본 확정 같은 다른 기록에는 합치지 않음 — 되돌림 행 뒤의 편집은 새 행으로 남아 되돌림 시점이 지워지지 않음
 */
export function historyMergeable(last: { edited_by: string | null; edited_at: string; summary: string | null } | null | undefined, editorId: string, nowMs: number): boolean {
  if (!last || last.edited_by !== editorId) return false;
  const summary = String(last.summary ?? "");
  if (summary.startsWith(REVERT_PREFIX) || !summary.startsWith(AUTOSAVE_SUMMARY)) return false;
  return nowMs - new Date(last.edited_at).getTime() < HISTORY_MERGE_MS;
}
