// 공통 지식 근거 묶음 절 이름(resources/prompts/_shared/knowledge.md를 기능 request.md가 kb.* 절로 끼움).
// 가져오는 것이 없는 모듈로 따로 둠 — lib/ai/writer.ts 등 프롬프트 명세가 이 목록을 쓰고, lib/knowledge/bundle.ts는 writer.ts를 가져오므로 순환을 피함
export const KB_SECTIONS = [
  "kb.institution",
  "kb.common",
  "kb.business",
  "kb.list",
  "kb.taskRow",
  "kb.none",
  // 선별 방식(실험, 기본 꺼짐 — lib/knowledge/select.ts)에서만 쓰는 절
  "kb.select.digestTrack",
  "kb.select.digestUnit",
  "kb.select.institution",
  "kb.select.common",
  "kb.select.business",
  "kb.select.picked",
  "kb.select.list",
  "kb.select.unpicked",
] as const;

/** 경영관리 프롬프트에만 있는 절 — 이 카드에 대한 외부 컨설팅 의견 머리(bundle.ts listText, 2026-11-20). 의견은 경영관리 카드에만 있어 주요사업 프롬프트·판은 그대로 */
export const KB_MG_SECTIONS = ["kb.consult"] as const;
