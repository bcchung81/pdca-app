// 경평 초안 평가용 2025 원본 쪽 이미지(수동 연기 시험 전용) — 초안이 고른(또는 닮은) 전년도 경영실적보고서 소항목의 PDF 쪽을 PNG로 뽑음.
// 호스티드 DB는 카드 원장을 읽기만 함(쓰지 않음). 전년 절 목록은 로컬 고정 사본(resources/knowledge/_chunks/rpt25-biz.jsonl)에서 읽음.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-pages.ts <evalDir>
//  <evalDir>/drafts/*.html.json마다 카드를 읽어 앱과 같은 규칙(pickPrior)으로 전년 절을 고르고,
//  없으면(0.16 미만) 점수 0.1 이상인 가장 닮은 절을 「비슷한 과제(참고)」로 대신 씀.
//  결과: <evalDir>/pages/<chunk key의 / → _>-<쪽 번호>.png + <evalDir>/pages/manifest.json(카드별 목록)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type PriorSection, pickPrior, scorePrior, toPriorSection } from "../../lib/reports/prior.ts";
import { PRIOR_SAME_SCORE, readSection } from "../../lib/reports/section.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

type Json = LooseJson;

const evalDir = process.argv[2];
if (!evalDir) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-pages.ts <evalDir>");
  process.exit(1);
}
const draftsDir = `${evalDir}/drafts`;
const pagesDir = `${evalDir}/pages`;
if (!existsSync(draftsDir)) throw new Error(`초안 폴더가 없음: ${draftsDir}`);
mkdirSync(pagesDir, { recursive: true });

const PDF = "data/templates/report-2025-biz/report-2025-biz-final.pdf"; // 2025년도 경영실적보고서 최종본(주요사업) — 기관 원본, git 밖
const PDFTOPPM = "/opt/homebrew/bin/pdftoppm";
/** 전년 절이 없을 때(0.16 미만) 참고로 보여줄 최소 점수 */
const FALLBACK_MIN_SCORE = 0.1;
/** 절 하나당 최대 쪽 수 */
const MAX_PAGES = 2;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const chunkRows: Json[] = readFileSync("resources/knowledge/_chunks/rpt25-biz.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const byKey = new Map(chunkRows.map((r) => [String(r.chunk_key), r]));

/** N쪽을 PNG로 렌더(이미 있으면 건너뜀) → <pagesDir>/<chunk key의 / → _>-<쪽 번호>.png */
function renderPage(chunkKey: string, page: number): string {
  const name = `${chunkKey.replace(/\//g, "_")}-${page}.png`;
  const target = `${pagesDir}/${name}`;
  if (existsSync(target)) return name;
  const tmp = `${pagesDir}/.tmp-render`;
  execFileSync(PDFTOPPM, ["-r", "90", "-png", "-f", String(page), "-l", String(page), PDF, tmp]);
  const producedName = readdirSync(pagesDir).find((f) => f.startsWith(`${basename(tmp)}-`));
  if (!producedName) throw new Error(`pdftoppm 산출물을 찾지 못함(${chunkKey} ${page}쪽)`);
  renameSync(`${pagesDir}/${producedName}`, target);
  return name;
}

interface ManifestSection {
  chunkKey: string;
  title: string;
  reportPage: number | null;
  score: number;
  same: boolean;
  fallback: boolean;
  images: string[];
}
const manifest: Record<string, ManifestSection[]> = {};

const files = readdirSync(draftsDir)
  .filter((f) => f.endsWith(".html.json"))
  .sort();
for (const file of files) {
  const base = file.slice(0, -".html.json".length);
  const spec = readSection(JSON.parse(readFileSync(`${draftsDir}/${file}`, "utf8")));
  if (!spec) continue;
  const id: string = spec.card.id || base.replace(/_/g, "/");
  const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data").eq("id", id).single();
  if (error || !card) {
    console.warn(`카드를 읽지 못함(${id}): ${error?.message}`);
    continue;
  }
  const sections: PriorSection[] = chunkRows.filter((r) => r.business === card.eval_unit_id).map(toPriorSection);
  const real = pickPrior(card.data, sections);
  const scored = scorePrior(card.data, sections);
  const picks = real.length ? real.map((p) => ({ ...p, fallback: false })) : scored[0] && scored[0].score >= FALLBACK_MIN_SCORE ? [{ ...scored[0], fallback: true }] : [];

  const entries: ManifestSection[] = [];
  for (const pick of picks) {
    const row = byKey.get(pick.section.key);
    if (!row) continue;
    const start = row.pdf_page_start;
    const end = Math.min(row.pdf_page_end, start + MAX_PAGES - 1);
    const images: string[] = [];
    for (let p = start; p <= end; p++) images.push(renderPage(pick.section.key, p));
    entries.push({ chunkKey: pick.section.key, title: pick.section.title, reportPage: pick.section.page, score: pick.score, same: pick.score >= PRIOR_SAME_SCORE, fallback: pick.fallback, images });
  }
  manifest[id] = entries;
  console.log(`${id}: ${entries.length ? entries.map((e) => `${e.chunkKey}(${e.images.length}쪽${e.fallback ? " · 참고" : ""})`).join(" · ") : "전년 절 없음"}`);
}

writeFileSync(`${pagesDir}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`manifest.json 씀: ${pagesDir}/manifest.json`);
