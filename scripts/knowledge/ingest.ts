// 공통 지식 적재 CLI — kordoc 산출물을 조각 JSONL과 검토용 CSV로 만듭니다.
//
//   pnpm knowledge:ingest            # 검산 실패(error)가 있으면 종료 코드 1
//   pnpm knowledge:ingest --allow-fail
//
// 입력: resources/knowledge/<원본>, resources/knowledge/_parsed/<이름>.chunks.json, seed/cards/260916/biz-260916.json
// 출력: resources/knowledge/_chunks/ (git 제외)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type KnowledgeImage, chunkImages } from "../../lib/knowledge/images.ts";
import { join, resolve } from "node:path";
import { KNOWLEDGE_DOCUMENTS } from "../../lib/knowledge/documents.ts";
import type { IngestOutput } from "../../lib/knowledge/pipeline.ts";
import { runIngest } from "../../lib/knowledge/pipeline.ts";
import type { Check, KnowledgeChunk } from "../../lib/knowledge/types.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const KNOWLEDGE = join(ROOT, "resources/knowledge");
const OUT = join(KNOWLEDGE, "_chunks");
const CARDS = join(ROOT, "seed/cards/260916/biz-260916.json");

function main() {
  const allowFail = process.argv.includes("--allow-fail");
  const inputs = KNOWLEDGE_DOCUMENTS.filter((d) => d.status === "ingest").map((spec) => {
    const original = join(KNOWLEDGE, spec.file_name);
    const parsed = join(KNOWLEDGE, "_parsed", `${spec.parsed_name}.chunks.json`);
    if (!existsSync(parsed)) throw new Error(`kordoc 산출물이 없습니다: ${parsed}`);
    const sha256 = existsSync(original) ? createHash("sha256").update(readFileSync(original)).digest("hex") : null;
    return { spec, sha256, kordoc: JSON.parse(readFileSync(parsed, "utf8")) };
  });
  const cards = (JSON.parse(readFileSync(CARDS, "utf8")) as { cards: unknown[] }).cards;

  const out = runIngest(inputs, cards);
  attachImages(out);
  write(out);
  const failed = out.checks.filter((c) => !c.ok && c.level === "error");
  printSummary(out, failed);
  if (failed.length && !allowFail) process.exitCode = 1;
}

/**
 * 그림(pnpm knowledge:parse --images가 꺼낸 것 — _parsed/images/<doc_id>.json)을 조각 쪽 범위로 짝지어 meta.images에(lib/knowledge/images.ts).
 * 그림 목록이 없는 문서·쪽 범위가 없는 조각은 그대로(조각 글·검색·AI 근거는 바뀌지 않음)
 */
function attachImages(out: IngestOutput) {
  for (const [docId, chunks] of Object.entries(out.chunks)) {
    const file = join(KNOWLEDGE, "_parsed", "images", `${docId}.json`);
    if (!existsSync(file)) continue;
    const images = JSON.parse(readFileSync(file, "utf8")) as KnowledgeImage[];
    let n = 0;
    for (const c of chunks) {
      const names = chunkImages(images, c.pdf_page_start, c.pdf_page_end);
      if (!names.length) continue;
      c.meta = { ...c.meta, images: names };
      n += 1;
    }
    console.log(`  그림 ${docId}: 조각 ${n}개에 붙임(그림 ${images.length}개)`);
  }
}

function write(out: IngestOutput) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "review"), { recursive: true });

  for (const [docId, chunks] of Object.entries(out.chunks)) {
    writeFileSync(join(OUT, `${docId}.jsonl`), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
  }
  writeFileSync(join(OUT, "card-finding-links.jsonl"), out.links.map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(join(OUT, "task-map.jsonl"), out.taskMap.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const manifest = {
    note: "공통 지식 적재 결과. 원본이 같으면 같은 결과가 나옵니다(시각 정보 없음).",
    documents: out.documents,
    deferred: out.deferred.map((d) => ({ doc_id: d.doc_id, file_name: d.file_name, scope: d.scope })),
    totals: {
      chunks: Object.values(out.chunks).reduce((s, c) => s + c.length, 0),
      searchable: Object.values(out.chunks).flat().filter((c) => c.searchable).length,
      card_finding_links: out.links.length,
    },
    checks: out.checks,
  };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  writeCsv(
    join(OUT, "review/finding-card-links-draft.csv"),
    ["카드", "카드 과제명", "카드 팀", "카드 지적 문장", "순위", "상태", "자동 근거", "점수", "팀 일치", "지적 문서", "지적 조각", "지적 번호", "지적 원문", "지적 부서", "확정(O/X)", "비고"],
    [
      ...out.links.map((l) => [l.card_id, l.card_title, l.card_team, l.card_finding, l.rank, l.status === "auto" ? "자동" : "후보", l.basis, l.score, l.team_match === null ? "-" : l.team_match ? "O" : "X", l.doc_id, l.chunk_key, l.finding_no ?? "", l.target_text, l.target_depts.join(", "), "", ""]),
      ...out.unlinked.map((u) => [u.card_id, "", "", u.card_finding, "", "연결 없음", "", u.best, "", "", "", "", "", "", "", ""]),
    ],
  );
  writeCsv(
    join(OUT, "review/task-map-draft.csv"),
    ["카드", "카드 과제명", "카드 본부", "카드 팀", "상태", "7월 과제 번호", "7월 과제명", "7월 담당", "제목 유사도", "번호 같음", "본부 같음", "점수", "차순위 과제", "차순위 점수", "2025 실행과제", "확정(O/X)", "비고"],
    [
      ...out.taskMap.map((r) => [r.card_id, r.card_title, r.card_department, r.card_team, r.status, r.best_task_no, r.best_task_title, r.best_task_dept, r.title_similarity, r.same_no ? "O" : "X", r.same_dept ? "O" : "X", r.score, r.second_task, r.second_score, "", "", ""]),
      ...out.orphanTasks.map((t) => [`(카드 없음) ${t.group}`, "", "", "", "7월 목록에만 있음", t.task_no, t.title, t.dept, "", "", "", "", "", "", "", "", ""]),
    ],
  );
  writeCsv(
    join(OUT, "review/mid-final-findings.csv"),
    ["중간보고서 행", "사업", "번호", "최종 평가보고서 조각", "최종 지적 번호", "점수", "중간보고서 원문", "최종 원문"],
    out.midFinal.map((p) => [p.mid_key, p.business, p.mid_no, p.final_key ?? "대응 없음", p.final_no ?? "", p.score, p.mid_text, p.final_text]),
  );
  writeFileSync(join(OUT, "REPORT.md"), report(out));
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 바로 열리도록 UTF-8 BOM을 붙입니다 */
function writeCsv(path: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  writeFileSync(path, `﻿${body}\r\n`);
}

function checkLine(c: Check): string {
  const mark = c.ok ? "통과" : c.level === "error" ? "**실패**" : "확인 필요";
  const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const detail = [c.expected !== undefined ? `기대 ${fmt(c.expected)}` : "", c.actual !== undefined ? `실제 ${fmt(c.actual)}` : "", c.note ?? ""].filter(Boolean).join(" · ");
  return `| ${mark} | ${c.name} | ${detail.replace(/\|/g, "\\|")} |`;
}

function report(out: IngestOutput): string {
  const lines: string[] = [];
  lines.push("# 공통 지식 적재 결과", "");
  lines.push("`pnpm knowledge:ingest`가 만든 요약입니다. 이 폴더(resources/knowledge/_chunks)는 git에 넣지 않습니다.", "");
  lines.push("## 문서", "", "| 문서 | 조각 | 단위별 | 범위 |", "|---|---|---|---|");
  for (const d of out.documents) {
    lines.push(`| ${d.doc_id} ${d.title} | ${d.chunk_count} | ${Object.entries(d.unit_counts).map(([k, v]) => `${k} ${v}`).join(", ")} | ${d.scope} |`);
  }
  for (const d of out.deferred) lines.push(`| ${d.doc_id} ${d.title} | 보류 | | ${d.scope} |`);
  lines.push("", "## 검산", "", "| 결과 | 항목 | 내용 |", "|---|---|---|");
  for (const c of out.checks) lines.push(checkLine(c));
  lines.push("", "## 검토 파일", "");
  lines.push("- `review/finding-card-links-draft.csv`: 카드 '경영평가 지적사항' 문장 ↔ 최종 평가보고서 번호 지적·중간보고서 행. 자동(점수·팀 기준)과 후보를 구분");
  lines.push("- `review/task-map-draft.csv`: 9월 카드 ↔ 7월 과제 목록(관리계획 붙임3). 2025 실행과제 열은 비워 둠");
  lines.push("- `review/mid-final-findings.csv`: 중간보고서(붙임5) 행 ↔ 최종 평가보고서(붙임1) 번호 지적");
  return lines.join("\n") + "\n";
}

function printSummary(out: IngestOutput, failed: Check[]) {
  for (const d of out.documents) console.log(`${d.doc_id}: 조각 ${d.chunk_count} ${JSON.stringify(d.unit_counts)}`);
  const warn = out.checks.filter((c) => !c.ok && c.level === "warn");
  console.log(`검산 ${out.checks.length}개: 실패 ${failed.length}, 확인 필요 ${warn.length}`);
  for (const c of [...failed, ...warn]) console.log(`  ${c.level === "error" ? "실패" : "확인"} ${c.name}: ${JSON.stringify(c.actual)}`);
  console.log(`출력: ${OUT}`);
}

export type { KnowledgeChunk };
main();
