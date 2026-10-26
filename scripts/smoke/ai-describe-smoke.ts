// 첨부 그림 설명 연기 시험(수동 실행 전용 — **API 경로 필요**: AI_PROVIDER=api + ANTHROPIC_API_KEY, 크레딧): 파일을 첨부처럼 읽어
// 읽은 방식(글 / 그림 설명)·글자 수·토큰·비용·설명 글 앞부분을 보여 줍니다. DB·저장소에는 아무것도 쓰지 않음(ai_requests도 안 남김).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-describe-smoke.ts <이미지 또는 스캔 PDF 또는 문서 파일> [...]
//  · 이미지(jpg·png·webp·gif)·글 없는 스캔 PDF → 그림 설명(light 모델 1회), 글이 있는 파일 → kordoc 글(모델 호출 없음)
//  · CLI 공급자(AI_PROVIDER=cli)면 그림 설명은 「보류(pending)」로 나옴 — 호출이 없어 비용도 0
// 크레딧이 없으면 호출이 거절되고(과금 없음) 「AI 사용 크레딧이 부족합니다」로 나옵니다.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseAttachment } from "../../lib/ai/attachments.ts";
import { estimateUsd } from "../../lib/ai/pricing.ts";
import { aiProvider } from "../../lib/ai/run.ts";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("사용법: ai-describe-smoke.ts <파일> [...]");
  process.exit(1);
}
console.log(`provider ${aiProvider()} · 파일 ${files.length}개`);
let total = 0;
for (const f of files) {
  const bytes = new Uint8Array(readFileSync(f));
  const t0 = Date.now();
  const o = await parseAttachment(bytes, basename(f));
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const usd = o.describe ? (estimateUsd(o.describe.model, o.describe.usage) ?? 0) : 0;
  total += usd;
  console.log(`\n■ ${basename(f)} (${(bytes.byteLength / 1024).toFixed(0)}KB) — ${o.status}${o.error ? ` · ${o.error}` : ""} · ${sec}초`);
  if (o.describe) console.log(`  그림 설명: 모델 ${o.describe.model} · 입력 ${o.describe.usage.input} 출력 ${o.describe.usage.output} 토큰 · 약 $${usd.toFixed(4)}`);
  if (o.text) console.log(`  글 ${o.text.length}자: ${o.text.slice(0, 500).replace(/\n/g, " ⏎ ")}${o.text.length > 500 ? " …" : ""}`);
}
console.log(`\n합계 약 $${total.toFixed(4)}`);
