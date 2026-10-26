// 개조식 초안(md-profile) → KCA 양식 HWPX: kordoc 입력으로 바꾸고(to_kordoc_input) → kordoc 공문서(보고서) 생성(R008)
// → KCA 후처리(postprocess.ts). 판단이 끼지 않는 결정론 변환입니다(같은 초안 → 같은 문서).

import { type GongmunOptions, markdownToHwpx } from "kordoc";
import { KCA_GONGMUN } from "./kca-profile.ts";
import { toKordocInput } from "./kordoc-input.ts";
import { type PostSummary, postprocessKca } from "./postprocess.ts";

/** 초안의 ※·＊ 줄(표·인용 블록 밖)이 순서대로 ＊였는가 — kordoc이 ＊를 ※로 바꿔 내는 것을 되돌리는 데 씀(R011) */
export function starLinesOf(draft: string): boolean[] {
  const out: boolean[] = [];
  let fence = false;
  for (const raw of draft.split(/\r?\n/)) {
    const t = raw.trim();
    if (/^```/.test(t)) {
      fence = !fence;
      continue;
    }
    if (fence || t.startsWith("|")) continue;
    if (t.startsWith("※") || t.startsWith("＊")) out.push(t.startsWith("＊"));
  }
  return out;
}

export async function draftToKcaHwpx(draft: string): Promise<{ bytes: Uint8Array; warnings: string[]; summary: PostSummary }> {
  const warnings: string[] = [];
   
  const raw = await markdownToHwpx(toKordocInput(draft), { gongmun: KCA_GONGMUN as GongmunOptions, warnings });
  const { bytes, summary } = await postprocessKca(new Uint8Array(raw), starLinesOf(draft));
  return { bytes, warnings, summary };
}
