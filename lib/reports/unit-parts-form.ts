// 경영관리 지표 단위 부분 화면(/reports/business/<지표>/parts)의 칸 값 도구(순수 — 입출력 없음, 브라우저에서도 씀).
// 고친 칸은 「경로 → 값」 표로 들고(경로는 lib/reports/unit-parts-edit.ts 허용 경로와 같음), 원래 값과 사실상 같으면(공백·빈 줄 차이) 저장 대상에서 뺌.
// 입력 칸은 사람이 친 그대로(끝 줄바꿈 포함) 두고, 저장 목록을 만들 때만 서버와 같은 규칙(공백 한 칸·앞뒤 공백·빈 줄 뺌)으로 정리해 견줌.

/** 고친 칸: 경로 → 값(글 목록·글·참거짓·극성·담당자 표) */
export type EditMap = Record<string, unknown>;

export interface PartEdit {
  path: string;
  value: unknown;
}

/** 서버 액션 한 번에 보낼 수 있는 칸 수(actions.ts saveUnitPartEdits의 slice) */
export const EDITS_PER_CALL = 60;

/** 부분 spec 안 경로(「rows.0.ai.actions」)의 값 — 없으면 undefined */
export function getAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const emptyish = (x: unknown) => x === "" || (x !== null && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((y) => y === ""));

/** 서버(applyUnitPartEdits)와 같은 정리: 글은 공백 한 칸·앞뒤 공백 뺌, 목록은 빈 줄·빈 행을 뺌 */
export function normalizeValue(v: unknown): unknown {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (Array.isArray(v)) return v.map(normalizeValue).filter((x) => !emptyish(x));
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizeValue(x)]));
  return v;
}

const same = (a: unknown, b: unknown) => JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));

/** 칸 값 하나 바꾸기(불변): 친 그대로 두되(끝 줄바꿈 포함) 저장된 값과 글자까지 같아지면 고친 칸에서 뺌 */
export function setEdit(edits: EditMap, spec: unknown, path: string, value: unknown): EditMap {
  const next = { ...edits };
  if (JSON.stringify(getAtPath(spec, path)) === JSON.stringify(value)) delete next[path];
  else next[path] = value;
  return next;
}

/** 칸 지금 값: 고친 값이 있으면 그것, 없으면 저장된(또는 재료로 만든) 값 */
export function valueAt(edits: EditMap, spec: unknown, path: string): unknown {
  return path in edits ? edits[path] : getAtPath(spec, path);
}

/** 저장할 칸 목록: 원래 값과 사실상 다른 것만, 값은 서버가 받는 모양 그대로(정리는 서버도 다시 함) */
export function editList(edits: EditMap, spec: unknown): PartEdit[] {
  return Object.entries(edits)
    .filter(([path, value]) => !same(getAtPath(spec, path), value))
    .map(([path, value]) => ({ path, value }));
}

/** 서버 한 번 호출 분량으로 나눔 */
export function chunkEdits(list: PartEdit[], size = EDITS_PER_CALL): PartEdit[][] {
  const out: PartEdit[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 글 목록 칸 ↔ 여러 줄 입력 */
export const linesToText = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("\n") : "");
export const textToLines = (t: string): string[] => t.split("\n");
