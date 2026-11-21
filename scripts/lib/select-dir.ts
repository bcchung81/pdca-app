// 공통 지식 선별 방식 병행 비교(지식공급 하이브리드 선별 계획 §5 7단계)의 실험 출처: 로컬 폴더의 선별 결과를 setSelectionSource(lib/ai/context.ts)에 꽂는 함수.
// 앱 코드에 두지 않음(금기 1 — 앱 실행 경로에서 로컬 파일을 읽지 않음). 실험 스크립트만 씀.
// 폴더 모양: <dir>/selection.json = { cards: { [카드 id(cards.id)]: { keys: string[] } } }, <dir>/rules/<id>.md = 규칙 문서 글
//   (트랙 공통 id: 주요사업 track-biz·경영관리 track-mg, 평가단위 id: BZ-1·MG-3 … — scripts/knowledge/rules-digest.ts 산출과 같은 이름)
// 기준류를 원문 그대로 두는 트랙(TrackSpec.selectRules = raw — 경영관리, 2026-11-21)은 규칙 파일을 읽지 않고 고른 키만 줌(규칙 문서 글은 빈 글).
// 그 밖 트랙은 그 카드의 규칙 파일(트랙 공통·평가단위) 중 하나라도 없으면 null → 앱이 통째로 넣기로 감.
// selection.json에 없는 카드(파일이 없어도)는 기본이 null(통째로 넣기).
// opts.asDb = 파일을 운영 DB 선별 행(card_knowledge_select) 대신으로 씀(2026-11-21 — 한 실행에서 주요사업은 운영 DB, 경영관리는 로컬 파일로 같이 돌릴 때):
//   파일에 없는 카드는 undefined(앱 기본 출처 — 운영 DB 선별 행·규칙 문서로 넘김), 파일에 있는 카드도 DB 출처와 같게 트랙 설정(KNOWLEDGE_SELECT_TRACKS — 용도·기능별)과
//   최소 개수(SELECT_MIN_KEYS)를 따름(아니면 null). 대응표 rejected는 select-build.ts가 파일을 만들 때 이미 뺌(그 뒤 바뀐 rejected는 반영 안 됨)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SelectionSource } from "../../lib/ai/context.ts";
import { type CardSelection, SELECT_MIN_KEYS, selectTrackOn } from "../../lib/knowledge/select.ts";
import { trackSpecOfUnit } from "../../lib/tracks/index.ts";

/** 트랙 공통 규칙 문서의 파일 id */
export const trackDigestId = (evalUnitId: string) => (trackSpecOfUnit(evalUnitId).id === "경영관리" ? "track-mg" : "track-biz");

/** 없으면 null(다른 읽기 오류는 그대로 던짐 — 권한 문제 같은 것을 「선별 없음」으로 숨기지 않게) */
async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** selection.json에서 이 카드의 고른 키(순서 = 순위). 파일·카드가 없으면 null, 모양이 틀리면 오류 */
async function cardKeys(dir: string, cardId: string): Promise<string[] | null> {
  const raw = await readOrNull(join(dir, "selection.json"));
  if (raw === null) return null;
  const entry = (JSON.parse(raw) as { cards?: Record<string, { keys?: unknown }> }).cards?.[cardId];
  if (!entry) return null;
  if (!Array.isArray(entry.keys) || entry.keys.some((k) => typeof k !== "string")) throw new Error(`selection.json의 ${cardId} keys가 문자열 목록이 아닙니다.`);
  return entry.keys as string[];
}

/** 폴더의 선별 결과를 주는 출처(부를 때마다 파일을 읽음 — 비교 도중 다른 작업자가 파일을 채워도 다음 카드부터 반영) */
export function selectionFromDir(dir: string, opts: { asDb?: boolean } = {}): SelectionSource {
  return async (card, req): Promise<CardSelection | null | undefined> => {
    const keys = await cardKeys(dir, card.id);
    if (!keys) return opts.asDb ? undefined : null;
    if (opts.asDb && (!selectTrackOn(process.env.KNOWLEDGE_SELECT_TRACKS, trackSpecOfUnit(card.evalUnitId).id, req.purpose, req.feature) || keys.length < SELECT_MIN_KEYS)) return null;
    if (trackSpecOfUnit(card.evalUnitId).selectRules === "raw") return { keys, digest: { track: "", unit: "" } };
    const [track, unit] = await Promise.all([readOrNull(join(dir, "rules", `${trackDigestId(card.evalUnitId)}.md`)), readOrNull(join(dir, "rules", `${card.unit}.md`))]);
    if (track === null || unit === null) return null;
    return { keys, digest: { track, unit } };
  };
}
