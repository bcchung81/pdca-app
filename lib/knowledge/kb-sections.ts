// 공통 지식 근거 묶음 절 이름(resources/prompts/_shared/knowledge.md를 기능 request.md가 kb.* 절로 끼움).
// 가져오는 것이 없는 모듈로 따로 둠 — lib/ai/writer.ts 등 프롬프트 명세가 이 목록을 쓰고, lib/knowledge/bundle.ts는 writer.ts를 가져오므로 순환을 피함
export const KB_SECTIONS = ["kb.institution", "kb.common", "kb.business", "kb.list", "kb.taskRow", "kb.none"] as const;
