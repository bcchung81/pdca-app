import { getOutlineCatalog } from "../../app/(app)/reports/cards/outline-actions";
import type { OutlineCatalog } from "../../lib/reports/outline-view.ts";

/** 견본 그림 + 여러 안 비용 어림(구성안 한 번 — 모르는 모델이면 null) */
export type LoadedCatalog = OutlineCatalog & { altCost: number | null };

/**
 * 도식·틀 견본 그림(고정값 — 로그인만 확인하면 늘 같음)을 트랙마다 한 번만 불러 재사용합니다(도식 목록·틀 갤러리 대화 창이 열릴 때마다 다시 부르지 않음).
 * 실패하면 다음에 부를 때 다시 시도하도록 약속을 비웁니다.
 */
const cache: Partial<Record<"biz" | "mg", Promise<LoadedCatalog>>> = {};

export function loadOutlineCatalog(mg = false): Promise<LoadedCatalog> {
  const k = mg ? "mg" : "biz";
  cache[k] ??= getOutlineCatalog(mg).catch((e) => {
    delete cache[k];
    throw e;
  });
  return cache[k];
}
