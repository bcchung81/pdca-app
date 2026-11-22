// 붙임2(유관기관 평가보고서 정리) 저장 — 관리 화면 올리기(app/(app)/admin/library/actions.ts uploadPeerCases)가 부름.
// 일반 문서 올리기(lib/knowledge/upload.ts)와 같은 크기 보호(guard.ts — 사업·지표마다 요청 앞 공통 지식 SHARED_CHARS_LIMIT)를 거친 뒤 공유 쓰기 함수(save.ts)로 씀.
// 저장 중간에 실패하면(문서 행 → 조각 100개씩 → 옛 사례 삭제 순서) 되돌리지 않고 같은 파일을 다시 올리라고 안내(2026-11-22 사용자 결정 —
// 다시 올리면 업서트 + prune으로 통째로 맞춰짐).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BundleChunk } from "./bundle.ts";
import { overLimitMessage, sharedSizeReport } from "./guard.ts";
import { saveDocumentsAndChunks } from "./save.ts";
import type { KnowledgeChunk } from "./types.ts";

export const PEER_SAVE_FAILED_MSG = "붙임2를 저장하다 멈췄습니다 — 일부만 바뀌었을 수 있으니 같은 파일을 다시 올려 주세요.";

/**
 * 크기 보호 → 저장. existing = 지금 DB의 모든 트랙 조각(일반 문서 올리기와 같이 캐시 없이 읽은 것 — loadBundleChunks(db, "all", { fresh: true })).
 * 넘으면 아무것도 쓰지 않고 일반 문서와 같은 문구(overLimitMessage)를 돌려줌. 같은 문서의 옛 사례는 새 사례로 바꿔서 잼(sharedSizeReport)
 */
export async function storePeerCases(db: SupabaseClient, doc: Record<string, unknown>, chunks: KnowledgeChunk[], existing: BundleChunk[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const over = overLimitMessage(sharedSizeReport(existing, chunks as unknown as BundleChunk[]));
  if (over) return { ok: false, message: over };
  try {
    await saveDocumentsAndChunks(db, [doc], chunks as unknown as Array<Record<string, unknown>>, { prune: true });
  } catch (e) {
    console.error("storePeerCases", (e as Error).message);
    return { ok: false, message: PEER_SAVE_FAILED_MSG };
  }
  return { ok: true };
}
