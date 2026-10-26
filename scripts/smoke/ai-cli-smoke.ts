// AI 작성지원 CLI 경로 연기 시험(수동 실행 전용): 시드 카드 1장으로 callWriter를 한 번 부르고 결과 형식을 확인합니다.
// 실행: node --conditions=react-server scripts/smoke/ai-cli-smoke.ts [mode] [첨부파일]
// 보완 점검(followup)은 운영 DB를 읽지 않고 합성 점검표를 씁니다: ROWS=4(기본)~20 = 미흡 행 수. 예: ROWS=20 node … followup
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { readAttachment } from "../../lib/ai/attachments.ts";
import { followupBasis } from "../../lib/ai/followup.ts";
import { aiProvider, callWriter, modelLabel } from "../../lib/ai/run.ts";
import { type WriterMode, verifyResult } from "../../lib/ai/writer.ts";
import { FORM_TABLES, TABLE_KEYS, emptyResult } from "../../lib/inspections/model.ts";
import { buildBundle } from "../../lib/knowledge/bundle.ts";

const mode = (process.argv[2] ?? "improve") as WriterMode;
const file = process.argv[3];
const seed = JSON.parse(readFileSync("seed/cards/260916/biz-260916.json", "utf8"));
const card = seed.cards[0];
const files = file ? [await readAttachment(new Uint8Array(readFileSync(file)), basename(file))] : [];

/** 합성 점검표: 앞에서부터 ROWS개 행을 미흡으로(★핵심 행이 섞이도록 표 순서대로) */
function syntheticBasis() {
  const rows = Math.min(20, Math.max(1, Number(process.env.ROWS ?? 4)));
  const result = emptyResult();
  let n = 0;
  for (const k of TABLE_KEYS)
    FORM_TABLES[k].rows.forEach((f, i) => {
      if (n >= rows) return;
      n += 1;
      result[k][i] = {
        judgment: "미흡",
        question: k === "patterns" ? "이 항목이 평가에서 충분히 설명되는가?" : "",
        fix: `'계량 성과지표'·'추진성과 — 정량' 칸에 ${f.name}을(를) 보여 주는 수치와 사유를 추가`,
        evidence: [{ source: "붙임1 자가진단 체크리스트", quote: "성과가 국민 체감 변화로 이어졌는지 확인한다", key: null, verified: null }],
        card: "'추진성과 — 정량' — 수치와 사유가 부족함",
        note: "",
      };
    });
  return followupBasis({ period: "2026-09", status: "sent", result });
}
const followup = mode === "followup" ? syntheticBasis() : null;

const t0 = Date.now();
const call = await callWriter({
  card,
  kb: buildBundle([], { evalUnitId: "BZ-1", data: card }),
  req: { mode, note: "", periodLabel: "2026년 9월", attachmentText: null, followup },
  files,
});
const result = verifyResult(call.result, card, [], followup);
const f = result.followup;
console.log(
  JSON.stringify(
    {
      provider: aiProvider(),
      model: modelLabel(call),
      ms: Date.now() - t0,
      usage: call.usage,
      headline: result.headline,
      suggestions: result.suggestions.length,
      applicable: result.suggestions.filter((s) => s.applicable).length,
      needInput: result.needInput,
      files: files.map((x) => ({ name: x.name, chars: x.text.length })),
      followup: f && {
        asked: followup?.rows.length,
        counts: f.counts,
        missing: f.items.filter((i) => i.missing).length,
        cardQuoteOk: f.items.filter((i) => i.cardQuoteOk === true).length,
        cardQuoteBad: f.items.filter((i) => i.cardQuoteOk === false).length,
        inspectionQuoteBad: f.items.filter((i) => i.inspectionQuoteOk === false).length,
      },
    },
    null,
    1,
  ),
);
