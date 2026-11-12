// 수동 연기 시험: 경평 초안 블록 고치기·질문(운영 서버 액션 runDraftBlockEdit과 같은 근거·검증, DB에는 쓰지 않음)
// node --conditions=react-server --env-file=.env.local scripts/smoke/ai-block-smoke.ts <카드 id> <블록 번호(1부터)|result> <edit|ask> "<요청>" ["<고른 글>"] [--dry]
//  블록 번호 자리에 result(또는 0)면 추진성과 상자(대상 번호 -1 — 주요사업 v3만, 2026-10-13)
//  --dry: AI를 부르지 않고 요청 글 크기만(운영 DB는 읽기만)
//  --spec <초안 JSON>(2026-11-12 T1): 저장본 대신 연기 시험이 만든 초안(<HTML>.json)을 고침 · --file <첨부>(되풀이 가능): 그 파일 글을 근거(첨부)에 넣음(운영은 카드 첨부가 근거에 들어감)
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readAttachment } from "../../lib/ai/attachments.ts";
import { inspectionCardText } from "../../lib/ai/inspect.ts";
import { callReportBlock, modelLabel } from "../../lib/ai/run.ts";
import { cardOutline } from "../../lib/ai/writer.ts";
import { reportBlockPrompts, reportDraftPrompts } from "../../lib/prompts/sets.ts";
import { fillFrom } from "../../lib/prompts/template.ts";
import { listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { RESULT_INDEX, applyBlockEdit, applyResultEdit, blockEditPrompt, readBlockEditRequest, resultBoxOf, resultEditPrompt, verifyBlockEdit, verifyResultEdit } from "../../lib/reports/block-edit.ts";
import { blockTexts } from "../../lib/reports/blocks.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { pickPrior, scorePrior, toPriorSection } from "../../lib/reports/prior.ts";
import { cleanLine, evidenceKey, quoteFoundIn, readSection, recheckSection } from "../../lib/reports/section.ts";

const dry = process.argv.includes("--dry");
const argv = process.argv.slice(2);
const valued = (name: string) => argv.flatMap((a, i) => (argv[i - 1] === name ? [a] : []));
const specFile = valued("--spec")[0];
const fileArgs = valued("--file");
const [id = "주요사업1/1-가", no = "1", kind = "edit", request = "", quote = ""] = argv.filter((x, i) => x !== "--dry" && !x.startsWith("--") && !["--spec", "--file"].includes(argv[i - 1]));
const isResult = no === "result" || no === "0";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const { data: row } = await db.from("card_report_drafts").select("spec").eq("card_id", id).eq("year", 2026).maybeSingle();
const spec = specFile ? readSection(JSON.parse(readFileSync(specFile, "utf8"))) : row?.spec ? readSection(row.spec) : null;
if (!spec?.blocks?.length) throw new Error("블록 목록 초안이 없음");
const req = readBlockEditRequest({ blockIndex: isResult ? RESULT_INDEX : Number(no) - 1, kind, request, quote }, spec);
if (typeof req === "string") throw new Error(req);

// 근거: 초안을 만들 때와 같게(첨부는 이 시험에서 뺌 — 전년 절은 초안에 남은 키 또는 자동, 실사 답변)
const { data: rows } = await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card.eval_unit_id);
const sections = (rows ?? []).map(toPriorSection);
const scored = scorePrior(card.data, sections);
const prior = spec.priorKeys ? spec.priorKeys.map((k) => scored.find((p) => p.section.key === k)).filter((p) => p !== undefined) : pickPrior(card.data, sections);
const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
const files = await Promise.all(fileArgs.map((f) => readAttachment(new Uint8Array(readFileSync(f)), basename(f))));
if (files.length) console.log(`첨부: ${files.map((f) => f.name).join(", ")}`);
const known = [...files.map((f) => f.text), ...prior.map((p) => p.section.text), ...lens.filter((x) => x.group === "survey").map((x) => x.text)].join("\n");
const quoteOnly = lens.filter((x) => x.group !== "survey").map((x) => x.text).join("\n");
const cardText = `${cardOutline(card.data)}\n${inspectionCardText(card.data)}`;

const evidence = { card: cardText, extra: known };
// 요청 글 크기(운영 reportStructured와 같은 짜임 — 공통 지식 ①~③은 요청 앞 따로, 목록표는 요청 글 첫머리)
const sizes = () => {
  const kbp = reportDraftPrompts().prompts;
  const list = listText(kbp, kb).length;
  return { version: reportBlockPrompts().prompts.version, system: fillFrom(reportBlockPrompts().prompts, "system", "system", {}).length, shared: sharedTexts(kbp, kb).reduce((n, t) => n + t.length, 0), request: list + 2 + prompt.length, prompt: prompt.length, card: cardText.length, extra: known.length };
};
const t0 = Date.now();
let prompt: string;
if (req.blockIndex === RESULT_INDEX) {
  // 추진성과 상자(2026-10-13): 운영 runDraftBlockEdit의 runResultEdit과 같은 요청 글·검증
  const before = resultBoxOf(spec);
  console.log(`추진성과 [${req.kind}] 줄 ${before.results.length} · 띠 ${before.resultBand ? `「${before.resultBand}」` : "없음"} · 3칸 ${spec.resultCards?.length ?? 0} · 막대 ${spec.resultChart ? "있음" : "없음"}`);
  console.log("고치기 전:\n  " + [...before.results, before.resultBand].filter(Boolean).join("\n  "));
  prompt = resultEditPrompt(reportBlockPrompts().prompts, spec, req, evidence);
  if (dry) {
    console.log(JSON.stringify(sizes(), null, 1));
    process.exit(0);
  }
  if (req.kind === "ask") {
    const call = await callReportBlock({ kind: "ask", prompt, kb });
    console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage }, null, 1));
    console.log("답:\n" + call.output.answer);
  } else {
    const call = await callReportBlock({ kind: "result", prompt, kb });
    const v = verifyResultEdit(before, call.output, cleanLine);
    console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, reply: call.output.reply }, null, 1));
    if (!v.ok) console.log("받지 않음:", v.message);
    else {
      const checked = recheckSection(applyResultEdit(spec, v.box), card.data, known, 2026);
      const was = recheckSection(spec, card.data, known, 2026);
      console.log("고친 뒤:\n  " + [...v.box.results, v.box.resultBand].filter(Boolean).join("\n  "));
      console.log(JSON.stringify({ changed: v.changed, dropped: v.dropped, fit: `${was.spec.fit?.total} → ${checked.spec.fit?.total}/${checked.spec.fit?.budget}mm`, unknown: checked.unknownNumbers }, null, 1));
    }
  }
  process.exit(0);
}
const before = spec.blocks[req.blockIndex];
console.log(`블록 ${req.blockIndex + 1}/${spec.blocks.length} [${before.label || "전폭"}] ${before.kind}${before.variant ? `:${before.variant}` : ""}`);
console.log("고치기 전:\n  " + blockTexts(before).join("\n  "));
prompt = blockEditPrompt(reportBlockPrompts().prompts, spec, req, evidence);
if (dry) {
  console.log(JSON.stringify(sizes(), null, 1));
  process.exit(0);
}
if (req.kind === "ask") {
  const call = await callReportBlock({ kind: "ask", prompt, kb });
  console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage }, null, 1));
  console.log("답:\n" + call.output.answer);
} else {
  const call = await callReportBlock({ kind: "edit", prompt, kb });
  const hay = evidenceKey(card.data, known, quoteOnly);
  const v = verifyBlockEdit(before, call.output.block, cleanLine, (q) => quoteFoundIn(hay, q));
  console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, reply: call.output.reply }, null, 1));
  if (!v.ok) {
    console.log("받지 않음:", v.message);
  } else {
    const next = applyBlockEdit(spec, req.blockIndex, v.block);
    const checked = recheckSection(next, card.data, known, 2026);
    const was = recheckSection(spec, card.data, known, 2026);
    console.log("고친 뒤:\n  " + blockTexts(v.block).join("\n  "));
    console.log(JSON.stringify({ changed: v.changed, dropped: v.dropped, fit: `${was.spec.fit?.total} → ${checked.spec.fit?.total}/${checked.spec.fit?.budget}mm`, unknown: checked.unknownNumbers, warnings: checked.warnings }, null, 1));
  }
}
