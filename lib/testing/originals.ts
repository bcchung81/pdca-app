// 시험 전용: 공개 저장소에서 뺀 원본(기관 자료 — git 밖, 이 컴퓨터에만 있음)의 경로·있음 여부·건너뛰기 이유를 한 곳에 둡니다(2026-10-26 공개 전환).
// 원본이 없으면 읽지 않고 빈 값을 돌려주고, 원본이 필요한 시험은 `test(이름, { skip: NO_SEED_CARDS }, …)`처럼 이유를 적고 건너뜁니다
// (docs/design/tests.md 「원본 필요 시험」). 앱 실행 경로에서는 import하지 않습니다.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

/** 카드 59장 원본(카드 JSON·정적 조각·그림·kordoc 글) */
export const SEED_CARD_DIR = join(ROOT, "seed/cards/260916");
export const SEED_CARD_JSON = join(SEED_CARD_DIR, "biz-260916.json");
export const HAS_SEED_CARDS = existsSync(SEED_CARD_JSON);
export const NO_SEED_CARDS: false | string = !HAS_SEED_CARDS && "카드 59장 원본(seed/cards/260916/ — git 밖, 공개 저장소에서 뺌)이 없음";

/** 카드 원본 JSON의 cards 배열 — 원본이 없으면 빈 배열 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seedCards<T = any>(): T[] {
  return HAS_SEED_CARDS ? (JSON.parse(readFileSync(SEED_CARD_JSON, "utf8")) as { cards: T[] }).cards : [];
}

/** 기관 내부 지침 사본(09·14·08·13 가공본 + PROCESSING.md·SOURCE.json) */
export const PDCA_GUIDE_DIR = join(ROOT, "resources/harness/pdca");
export const HAS_PDCA_GUIDES = existsSync(join(PDCA_GUIDE_DIR, "SOURCE.json"));
export const NO_PDCA_GUIDES: false | string = !HAS_PDCA_GUIDES && "지침 사본(resources/harness/pdca/ — git 밖, 공개 저장소에서 뺌)이 없음";

/** 지침 사본 한 파일의 글 — 사본이 없으면 빈 문자열 */
export function pdcaGuide(name: string): string {
  return HAS_PDCA_GUIDES ? readFileSync(join(PDCA_GUIDE_DIR, name), "utf8") : "";
}
