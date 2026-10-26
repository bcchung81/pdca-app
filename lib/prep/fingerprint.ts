// 과제 정체성 지문: 과제명·실행과제·대상사업·계량지표 이름만 해시한다. 입출력 없음.
// 자동 저장이 월별 실적·문구 같은 다른 칸만 바꿀 때는 값이 같아, 매칭 작업을 등록하지 않는다(카드 저장 폭주 방지).

import { createHash } from "node:crypto";
import type { LooseJson } from "../loose-json.ts";


/** data = 카드 JSON(cards.data). 매칭이 기대는 칸만 본다 */
export function cardIdentityFingerprint(data: unknown): string {
  const d = (data ?? {}) as Record<string, LooseJson>;
  const kpiNames: string[] = (d.kpi?.rows ?? []).map((r: Record<string, unknown>) => String(r?.nameRaw ?? r?.name ?? "").trim()).filter(Boolean);
  const parts = [d.title, d.executionTaskNo, d.executionTask, d.targetBusiness].map((v) => String(v ?? "").trim());
  return createHash("sha256").update(JSON.stringify([...parts, kpiNames])).digest("hex").slice(0, 16);
}
