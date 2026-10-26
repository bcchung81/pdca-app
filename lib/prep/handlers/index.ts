// 종류별 처리기 등록표. 지금 처리기가 있는 것은 match_knowledge(3-3)뿐이다.
// 3-5 재정의(2026-09-30): 보고서 추가자료는 사람이 과제를 고르고(자료 매칭 처리기 없앰), 근거 목록표는 요청 때 계산한다(목록표 작업 없음).
// 이 파일은 서버(서버 액션 after·라우트·pnpm prep)에서만 불린다 — 모델 호출(server-only)을 연결하기 때문.
import { loadBundleChunks } from "../../ai/context.ts";
import { callMatchKnowledge } from "../../ai/run.ts";
import type { PrepHandler } from "../run.ts";
import type { PrepKind } from "../types.ts";
import { matchKnowledgeHandler } from "./match-knowledge.ts";

export const PREP_HANDLERS: Partial<Record<PrepKind, PrepHandler>> = {
  match_knowledge: matchKnowledgeHandler({ call: callMatchKnowledge, loadChunks: (store, track) => loadBundleChunks(store.reader(), track) }),
};
