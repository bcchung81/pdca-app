// 초안 표본 그리기(수동 실행 전용): 손으로 쓴(또는 저장해 둔) AI 답 JSON(SectionOutput v3)을 앱의 검증·렌더러로 HTML 한 파일로 씀. DB 저장 안 함.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/render-draft-sample.ts <카드 id> <답 JSON> <HTML 경로>
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pickPrior, toPriorSection } from "../../lib/reports/prior.ts";
import { sectionDocument } from "../../lib/reports/section-html.ts";
import { type SiblingCard, sectionContext, siblingLayout, verifySection } from "../../lib/reports/section.ts";

const [id, answer, out] = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
const { data: sib } = await db.from("cards").select("id, task_no, data").eq("eval_unit_id", card!.eval_unit_id).eq("status", "active");
const siblings: SiblingCard[] = (sib ?? []).map((c) => ({ id: c.id, taskNo: c.task_no, targetBusiness: c.data?.targetBusiness ?? "", executionTaskNo: c.data?.executionTaskNo ?? "", executionTask: c.data?.executionTask ?? "" }));
const { data: rows } = await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card!.eval_unit_id);
const prior = pickPrior(card!.data, (rows ?? []).map(toPriorSection));
const v = verifySection(JSON.parse(readFileSync(answer, "utf8")), card!.data, sectionContext(card!.data, siblings), prior.map((p) => p.section.text).join("\n"));
console.log(JSON.stringify({ story: v.spec.story, layout: siblingLayout(v.spec)?.signature, blocks: v.spec.blocks?.length, unknownNumbers: v.unknownNumbers, warnings: v.warnings }, null, 1));
writeFileSync(out, sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "", model: process.argv[5] ?? "손으로 쓴 표본" }));
writeFileSync(`${out}.json`, JSON.stringify(v.spec, null, 1));
