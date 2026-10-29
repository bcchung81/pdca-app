// 주요사업 2025 보고서 불릿 길이 측정(2026-10-29 — 주요사업 칸 글 한도 BIZ_TRACK.reportBulletChars의 근거, lib/tracks/index.ts).
// 경영관리 짝: scripts/eval/mg-fill-baseline.ts(지표 보고서 14건마다 불릿 평균 → 중앙값). 불릿 규칙은 두 스크립트가 같음(bullet-stats.ts allBullets).
// 실행: node scripts/eval/biz-bullet-baseline.ts [출력 파일]   (기본 docs/analysis/eval/2026-10-29-fill/biz-baseline.json — git 밖)
// 입력(git 밖 원본): resources/knowledge/_parsed/rpt25-biz.chunks.json(kordoc 산출물)·rpt25-biz.md. 없으면 이유를 출력하고 끝냄.
// 묶음 = 평가내용2 과제 소항목(가.·나. — 적재 파서 parseReport25가 자르는 62개, 경평 초안 한 장이 쓰는 단위). 평가내용1·3·4(계량·성과관리 정형 절)는 뺌.
//  소항목마다 불릿 평균 글자 수(bulletAvgLen) → summary.bulletAvgLenMedian = 소항목 bulletAvgLen의 중앙값(불릿 없는 소항목은 뺌).
//  파서는 표 칸을 「 | 」, 칸 안 줄바꿈(<br>)을 「 / 」로 펴므로 「 / 」를 줄바꿈으로 되돌린 뒤 같은 규칙으로 셈.
//  참고값: 사업(BZ-1~3)별 불릿 평균, md 글 전체(평가내용1~4 모두 — 경영관리 측정과 같은 범위)의 불릿 평균.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseReport25 } from "../../lib/knowledge/parsers/report25.ts";
import { loadKordocChunks } from "../../lib/knowledge/source.ts";
import { allBullets, bulletStats, median } from "./bullet-stats.ts";

const root = new URL("../../", import.meta.url).pathname;
const out = process.argv[2] ?? join(root, "docs/analysis/eval/2026-10-29-fill/biz-baseline.json");
const chunksPath = join(root, "resources/knowledge/_parsed/rpt25-biz.chunks.json");
const mdPath = join(root, "resources/knowledge/_parsed/rpt25-biz.md");
const missing = [chunksPath, mdPath].filter((p) => !existsSync(p));
if (missing.length) {
  console.log(`2025 주요사업 보고서 파싱본이 없어 측정하지 않음(git 밖 자료 — pnpm knowledge:parse): ${missing.join(", ")}`);
  process.exit(0);
}

const { chunks } = parseReport25(loadKordocChunks(JSON.parse(readFileSync(chunksPath, "utf8"))));
const subs = chunks.map((c) => {
  const bl = allBullets(c.blocks.join("\n").replace(/ \/ /g, "\n"));
  return { key: c.chunk_key, business: c.business, bl, ...bulletStats(bl) };
});
const counted = subs.filter((s) => s.bullets);
const byBusiness = Object.fromEntries(["BZ-1", "BZ-2", "BZ-3"].map((b) => [b, bulletStats(subs.filter((s) => s.business === b).flatMap((s) => s.bl))]));
const whole = bulletStats(allBullets(readFileSync(mdPath, "utf8")));
const summary = {
  subs: subs.length,
  subsWithBullets: counted.length,
  bulletAvgLenMedian: median(counted.map((s) => s.bulletAvgLen)),
  bulletAvgLenMin: Math.min(...counted.map((s) => s.bulletAvgLen)),
  bulletAvgLenMax: Math.max(...counted.map((s) => s.bulletAvgLen)),
  pooled: bulletStats(subs.flatMap((s) => s.bl)),
  byBusiness,
  wholeMd: whole,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), note: "평가내용2 과제 소항목(parseReport25)마다 「∙•」 불릿 평균 글자 수 → 중앙값, 참고로 사업별·md 전체 (biz-bullet-baseline.ts)", summary, subs: subs.map((s) => ({ key: s.key, business: s.business, bullets: s.bullets, bulletAvgLen: s.bulletAvgLen, bulletShortShare: s.bulletShortShare })) }, null, 1));
const f = (n: number) => n.toFixed(2);
console.log(`소항목 ${summary.subs}개(불릿 있는 것 ${summary.subsWithBullets}) · 불릿 평균 소항목별 ${f(summary.bulletAvgLenMin)}~${f(summary.bulletAvgLenMax)}자 · 중앙값 ${f(summary.bulletAvgLenMedian)}자`);
console.log(`참고: 소항목 불릿 전체 ${summary.pooled.bullets}개 평균 ${f(summary.pooled.bulletAvgLen)}자·10자↓ ${(summary.pooled.bulletShortShare * 100).toFixed(0)}% · ${Object.entries(byBusiness).map(([b, s]) => `${b} ${f(s.bulletAvgLen)}자`).join(" · ")} · md 전체 ${whole.bullets}개 ${f(whole.bulletAvgLen)}자`);
console.log(`→ ${out}`);
