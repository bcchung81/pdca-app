// 카드 리뷰어 드래그 코멘트 연기 시험(수동 실행 전용): 호스티드 DB에서 카드 원장·공통 지식을 읽기만 하고
// callComments 한 번 → verifyComments 결과를 보여 줍니다(카드에 반영·저장하지 않음, ai_requests 기록도 안 함).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-comment-smoke.ts [카드 id(기본 주요사업1/1-가)]
//
// 코멘트 1~2개는 카드의 실제 편집 가능한 칸에서 자동으로 골라 만듭니다(「수정」 1건 + 「질문」 1건).
import { createClient } from "@supabase/supabase-js";
import { type CommentInput, type CommentRequest, commentPrompt, verifyComments } from "../../lib/ai/comments.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { bundleRefs, listText } from "../../lib/knowledge/bundle.ts";
import { aiProvider, callComments, modelLabel } from "../../lib/ai/run.ts";
import { commentPrompts } from "../../lib/prompts/sets.ts";
import { editTargets, valueAt } from "../../lib/cards/patch.ts";
import { pathLabel } from "../../lib/cards/path-label.ts";
import { currentPeriod } from "../../lib/cards/view.ts";

const id = process.argv[2] || "주요사업1/1-가";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);

const targets = editTargets(card.data);
// 잠기지 않은 글줄 칸 중 글이 어느 정도 있는 것부터(짧은 라벨·빈 칸은 코멘트 예시로 부적절)
const candidates = [...targets.entries()]
  .filter(([, t]) => t.line && !t.locked)
  .map(([path]) => ({ path, text: String(valueAt(card.data, path) ?? "") }))
  .filter((c) => c.text.trim().length >= 20)
  .sort((a, b) => b.text.length - a.text.length);
if (candidates.length < 2) throw new Error(`코멘트 예시로 쓸 만한 칸이 모자람(${candidates.length}개) — 다른 카드 id로 시도`);
const [pick1, pick2] = candidates;
const quote = (t: string) => t.slice(0, Math.min(40, t.length));

const comments: CommentInput[] = [
  { id: "c1", kind: "edit", path: pick1.path, paths: [pick1.path], quote: quote(pick1.text), text: "이 부분을 더 쉬운 말로, 두괄식으로 다듬어 주세요." },
  { id: "c2", kind: "ask", path: pick2.path, paths: [pick2.path], quote: quote(pick2.text), text: "이 실적의 근거 자료가 있나요?" },
];
console.log(`대상 칸: c1=${pathLabel(pick1.path, card.data)} 「${quote(pick1.text)}」 · c2=${pathLabel(pick2.path, card.data)} 「${quote(pick2.text)}」`);

const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "card", "comment");
const period = currentPeriod();
const req: CommentRequest = { periodLabel: `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`, comments, keeps: [] };
const prompt = commentPrompt(commentPrompts().prompts, card.data, targets, listText(commentPrompts().prompts, kb), req);
console.log(`provider ${aiProvider()} · 카드 ${id} · 편집 칸 ${targets.size}개 · 근거 ${bundleRefs(kb).length}건 · 요청 ${prompt.length}자`);

const t0 = Date.now();
const call = await callComments({ card: card.data, targets, kb, req, files: [] });
const verified = verifyComments(call.result, card.data, targets, comments);
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage }, null, 1));
for (const v of verified) {
  console.log(`\n[${v.id}] ${v.outcome}${v.dropped ? ` (버린 편집 ${v.dropped})` : ""}`);
  console.log(`답: ${v.reply}`);
  for (const e of v.edits) console.log(`  편집 ${e.op} ${e.label}(${e.path})\n    전: ${e.before ?? ""}\n    후: ${e.lines.join(" / ")}`);
}
