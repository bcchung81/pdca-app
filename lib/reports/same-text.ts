// 같은 문장 기준값(순수 잎 모듈 — import 없음, 2026-10-29). 사업 조판의 같은 문장 찾기(business-layout.ts)·원장 줄 나누기(mg-close.ts)·
// 초안 안 반복 문장(repeat-figures.ts)이 같은 값을 씀. repeat-figures → business-layout → … → section → repeat-figures 고리를 피하려고 여기에 둠(mg-outcomes.ts와 같은 방식)

/** 같은 문장 기준: 두 문장의 닮은 정도(textSimilarity — 글자 두 개 묶음 겹침 ÷ 짧은 쪽 묶음 수)가 이 값 이상이면 같은 문장으로 봄(거의 그대로 옮긴 문장) */
export const SAME_TEXT_MIN = 0.8;
/** 같은 문장 찾기에서 짧은 문장은 뺌(글자 두 개 묶음이 이보다 적으면 — 「추진배경」 같은 라벨·「’25년 100국」 같은 수치 줄이 다른 문장에 들어 있어 1이 되는 것을 막음) */
export const SAME_TEXT_MIN_BIGRAMS = 8;
