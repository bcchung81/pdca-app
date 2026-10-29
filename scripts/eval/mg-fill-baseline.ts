// 경영관리 2025 보고서 기준값 측정(채점표 v2 P0) — docs/plan/경평초안-원장채움-수정.md.
// 실행: node scripts/eval/mg-fill-baseline.ts [출력 파일]   (기본 docs/analysis/eval/2026-10-29-fill/baseline.json — git 밖)
// 입력(git 밖 원본): resources/knowledge/rpt25-mg-NN.pdf(쪽 수) · resources/knowledge/_parsed/rpt25-mg-NN.md(글). 없으면 이유를 출력하고 끝냄.
// 지표(MG-N)마다:
//  E1 qtyPerPage    = md 글 전체의 수량 토큰 수 ÷ PDF 쪽 수 (수량 토큰 정의는 채점 도구와 같은 qtyTokens)
//  E5 perfPerSection = 추진성과 행의 성과 줄(수량 토큰·전환 표기가 든 불릿) 수 ÷ 추진성과 행 수
//  charsPerPage     = md 보이는 글자 수(그림 참조·태그·엔티티·표 기호·공백 제외 — 초안 HTML과 같은 visibleChars) ÷ PDF 쪽 수 — mg-style-profile.ts 스타일 프로필의 「쪽당 보이는 글자」 기준
//  불릿 통계(2026-10-29 — 경영관리 칸 글 한도 MGMT_TRACK.reportBulletChars의 근거, lib/tracks/index.ts):
//   md 글 전체를 <br>·표 칸 경계(<tr>·<td>·<th>·|)·줄바꿈으로 나눈 줄 중 「∙」·「•」로 시작하는 줄이 불릿(마크업은 빼고 앞뒤 공백 정리 — bullet-stats.ts allBullets, 주요사업 biz-bullet-baseline.ts와 같은 규칙)
//   bulletAvgLen     = 불릿 평균 글자 수(머리 기호와 그 뒤 공백을 뺀 길이, 공백 포함 — String length)
//   bulletShortShare = 10자 이하 불릿 비율 · bulletsPerPage = 불릿 수 ÷ PDF 쪽 수. summary.bulletAvgLenMedian = 지표 14개 bulletAvgLen의 중앙값
// md에서 추진성과 행 찾는 규칙(kordoc 산출물 모양):
//  ① 파이프 표 행  `|  | 추진성과 |  | ∙ A<br>∙ B |` — 둘째 칸이 정확히 「추진성과」
//  ② html 표 행    `<tr><td …></td><td …>추진성과</td><td …></td><td>∙ A<br>∙ B</td>…</tr>` — 여러 줄에 걸칠 수 있어 </tr>까지 모음
//  머리 행(`<th>추진성과</th>`·`| 구분 | … | 추진성과 |`)은 칸 모양이 달라 걸리지 않음.
// 행 안의 칸 글을 <br>·칸 경계로 줄로 나누고, 「∙·•-」로 시작하는 줄이 불릿(그렇지 않은 줄은 앞 불릿에 이어 붙임 — 차트 눈금 「’24년 ’25년」 같은 것).
// 내용이 빈 행(0줄)은 셈에서 뺌. 행을 하나도 못 찾으면 perfPerSection은 null.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { allBullets, bulletStats, median } from "./bullet-stats.ts";
import { isPerfLine, qtyTokens } from "./mg-para-score-core.ts";
import { visibleChars } from "./mg-style-profile-core.ts";

const root = new URL("../../", import.meta.url).pathname;
const out = process.argv[2] ?? join(root, "docs/analysis/eval/2026-10-29-fill/baseline.json");
const ids = Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, "0"));
const pdfPath = (n: string) => join(root, `resources/knowledge/rpt25-mg-${n}.pdf`);
const mdPath = (n: string) => join(root, `resources/knowledge/_parsed/rpt25-mg-${n}.md`);

const missing = ids.flatMap((n) => [pdfPath(n), mdPath(n)]).filter((p) => !existsSync(p));
if (missing.length) {
  console.log(`2025 보고서 원본이 없어 측정하지 않음(git 밖 자료): ${missing.length}개 없음 — 예: ${missing[0]}`);
  process.exit(0);
}

// 쪽 수 — kordoc이 쓰는 pdfjs-dist(kordoc 옆에 있음)
const req = createRequire(import.meta.resolve("kordoc"));
const pdfjs = await import(pathToFileURL(req.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
async function pageCount(file: string): Promise<number> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

const BULLET = /^[∙·•\-－○◦▪]/;
/** 추진성과 행 하나의 칸 글 → 불릿 줄 */
function bulletsOf(raw: string): string[] {
  const parts = raw.replace(/<br\s*\/?>|<\/t[dh]>|<\/tr>|<tr[^>]*>|<t[dh][^>]*>|\|/g, "\n").replace(/<[^>]+>/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (BULLET.test(p) || !out.length) out.push(p);
    else out[out.length - 1] += ` ${p}`;
  }
  return out;
}
function closingRows(md: string): string[][] {
  const lines = md.split("\n");
  const rows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const pipe = /^\|[^|]*\|\s*추진성과\s*\|(.*)$/.exec(l);
    if (pipe) {
      rows.push(bulletsOf(pipe[1]));
      continue;
    }
    if (/^<tr>.*<td[^>]*>추진성과<\/td>/.test(l)) {
      let row = l.replace(/^.*?<td[^>]*>추진성과<\/td>/, "");
      while (!row.includes("</tr>") && i + 1 < lines.length) row += `\n${lines[++i]}`;
      rows.push(bulletsOf(row));
    }
  }
  return rows;
}

const metrics: Record<string, { pages: number; qtyTokens: number; qtyPerPage: number; closingRows: number; perfLines: number; perfPerSection: number | null; bullets: number; bulletAvgLen: number; bulletShortShare: number; bulletsPerPage: number; visibleChars: number; charsPerPage: number }> = {};
for (const n of ids) {
  const md = readFileSync(mdPath(n), "utf8");
  const pages = await pageCount(pdfPath(n));
  const rows = closingRows(md).filter((r) => r.length);
  const perf = rows.reduce((s, r) => s + r.filter(isPerfLine).length, 0);
  const q = qtyTokens(md).length;
  const vc = visibleChars(md);
  const bl = allBullets(md);
  const { bulletAvgLen, bulletShortShare } = bulletStats(bl);
  metrics[`MG-${Number(n)}`] = { pages, qtyTokens: q, qtyPerPage: q / pages, closingRows: rows.length, perfLines: perf, perfPerSection: rows.length ? perf / rows.length : null, bullets: bl.length, bulletAvgLen, bulletShortShare, bulletsPerPage: bl.length / pages, visibleChars: vc, charsPerPage: vc / pages };
}
const summary = {
  qtyPerPageMedian: median(Object.values(metrics).map((m) => m.qtyPerPage)),
  perfPerSectionMedian: median(Object.values(metrics).flatMap((m) => (m.perfPerSection == null ? [] : [m.perfPerSection]))),
  bulletAvgLenMedian: median(Object.values(metrics).map((m) => m.bulletAvgLen)),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), note: "E1=md 수량 토큰 ÷ PDF 쪽 수, E5=추진성과 행의 성과 줄 평균, bullet*=md 전체 「∙•」 불릿의 평균 글자 수·10자 이하 비율·쪽당 수 (mg-fill-baseline.ts)", summary, metrics }, null, 1));
for (const [k, m] of Object.entries(metrics)) console.log(`${k.padEnd(6)} 쪽 ${String(m.pages).padStart(2)} · 수량 ${String(m.qtyTokens).padStart(4)} · E1 ${m.qtyPerPage.toFixed(1).padStart(5)}/쪽 · 추진성과 행 ${String(m.closingRows).padStart(2)} · 성과 줄 ${String(m.perfLines).padStart(2)} · E5 ${m.perfPerSection?.toFixed(2) ?? "null"} · 불릿 ${m.bulletAvgLen.toFixed(1)}자·10자↓ ${(m.bulletShortShare * 100).toFixed(0)}%·${m.bulletsPerPage.toFixed(1)}/쪽`);
console.log(`중앙값 E1 ${summary.qtyPerPageMedian.toFixed(1)}/쪽 · E5 ${summary.perfPerSectionMedian.toFixed(2)} · 불릿 평균 ${summary.bulletAvgLenMedian.toFixed(2)}자\n→ ${out}`);
