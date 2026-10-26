// 카드 「AI 작성지원 › 질문」 연기 시험(수동 실행 전용): 호스티드 DB에서 카드 원장·공통 지식을 읽기만 하고 callChat 한 번 → 마크다운 답을 보여 줍니다(저장 안 함).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-chat-smoke.ts [카드 id(기본 주요사업1/1-가)] [빠른 질문 key(기본 improve)]
import { createClient } from "@supabase/supabase-js";
import { QUICK_PROMPTS, chatPrompt, inspectionBrief } from "../../lib/ai/chat.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { bundleRefs, listText } from "../../lib/knowledge/bundle.ts";
import { aiProvider, callChat, modelLabel } from "../../lib/ai/run.ts";
import { parseMarkdown } from "../../lib/markdown.ts";
import { chatPrompts } from "../../lib/prompts/sets.ts";

const id = process.argv[2] || "주요사업1/1-가";
const key = process.argv[3] || "improve";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "card", "chat");
const q = QUICK_PROMPTS.find((p) => p.key === key)?.text ?? key;
const req = { question: q, history: [], periodLabel: "2026년 9월", inspection: inspectionBrief(null) };
const prompt = chatPrompt(chatPrompts().prompts, card.data, listText(chatPrompts().prompts, kb), req);
console.log(`provider ${aiProvider()} · 카드 ${id} · 근거 ${bundleRefs(kb).length}건 · 요청 ${prompt.length}자`);
const t0 = Date.now();
const call = await callChat({ card: card.data, kb, req, files: [] });
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, blocks: parseMarkdown(call.result.answer).map((b) => b.kind).join(",") }));
console.log(call.result.answer);
