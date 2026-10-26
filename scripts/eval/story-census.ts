// 2025 주요사업 최종본 소항목(평가내용2) 62개의 이야기 틀·여는 표지 분포(근사 — 수동 분석 보조, 2026-10-09).
// 틀 고르기(lib/reports/story-hints.ts)가 최종본 글에서 어떤 틀 후보를 내는지와 전년 절 짜임 근사(blocks.ts layoutHints)의 첫 표지를 셈.
// 최종본 글은 도식이 글로 펴진 것이라 신호가 카드보다 많음 — 「틀 후보가 한두 틀로 몰리지 않는지」를 보는 용도이지 정답 분류가 아님.
// 실행: node scripts/eval/story-census.ts [조각 jsonl — 기본 resources/knowledge/_chunks/rpt25-biz.jsonl(git 밖)]
import { existsSync, readFileSync } from "node:fs";
import { layoutHints } from "../../lib/reports/blocks.ts";
import { diagramHints } from "../../lib/reports/diagram-hints.ts";
import { storyHints } from "../../lib/reports/story-hints.ts";

const path = process.argv[2] ?? "resources/knowledge/_chunks/rpt25-biz.jsonl";
if (!existsSync(path)) {
  console.error(`조각 파일이 없음: ${path} — pnpm knowledge:ingest로 만든 rpt25-biz 조각이 필요합니다(git 밖).`);
  process.exit(1);
}

interface Chunk {
  unit_type: string;
  text: string;
  meta?: { task_no?: string; mark?: string; title?: string };
}
const sections = readFileSync(path, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as Chunk)
  .filter((c) => c.unit_type === "report_section");

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top1 = new Map<string, number>();
const anyHint = new Map<string, number>();
const opener = new Map<string, number>();
const rows: string[] = [];
for (const s of sections) {
  const hints = storyHints(diagramHints(s.text), s.text);
  bump(top1, hints[0]?.story ?? "(신호 없음)");
  for (const h of hints) bump(anyHint, h.story);
  bump(opener, layoutHints(s.text)[0] ?? "(표지 없음 — 불릿·칸 글로 시작한 것으로 봄)");
  rows.push(`${s.meta?.task_no ?? "?"} ${s.meta?.mark ?? ""}. ${(s.meta?.title ?? "").slice(0, 28)} → ${hints.map((h) => h.story).join(" · ") || "—"}`);
}
const sorted = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
console.log(rows.join("\n"));
console.log(JSON.stringify({ sections: sections.length, top1: sorted(top1), candidates: sorted(anyHint), opener: sorted(opener) }, null, 1));
