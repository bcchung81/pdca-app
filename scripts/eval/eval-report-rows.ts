// 판면 어림 보정용(수동 실행 전용, DB·AI 안 씀): 평가 라운드 폴더들의 초안 spec(drafts/*.html.json)을 지금 렌더러로 다시 그리되
// 행마다 data-fit-row 표지를 달고(sectionDocument marks), 같은 행의 어림(fitReport rows·제목부·추진성과)을 est.json에 씀.
// 실측은 ego lite로 그 HTML을 열어 행 표지 위치로 잼(scratchpad eval-rows-measure.sh) → eval-report-rows-cmp.ts가 종류별 오차표를 냄.
// 실행: node scripts/eval/eval-report-rows.ts <출력 폴더> <평가 폴더 …>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Block } from "../../lib/reports/blocks.ts";
import { fitReport, frameHeight } from "../../lib/reports/fit.ts";
import { sectionDocument } from "../../lib/reports/section-html.ts";
import { readSection } from "../../lib/reports/section.ts";

const [out, ...dirs] = process.argv.slice(2);
if (!out || !dirs.length) throw new Error("사용: eval-report-rows.ts <출력 폴더> <평가 폴더 …>");
mkdirSync(out, { recursive: true });

const FULL = new Set(["band", "banner", "quotes", "subhead", "case"]);
/** fitReport·blocksBody와 같은 행 묶음(행마다 블록 목록) */
function rowBlocks(blocks: Block[]): Block[][] {
  const rows: Block[][] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (!b.label || FULL.has(b.kind)) {
      rows.push([b]);
      i += 1;
      continue;
    }
    const parts: Block[] = [];
    while (i < blocks.length && blocks[i].label === b.label && !FULL.has(blocks[i].kind)) parts.push(blocks[i++]);
    rows.push(parts);
  }
  return rows;
}

const est: Record<string, unknown> = {};
for (const dir of dirs) {
  const round = basename(dir);
  const drafts = join(dir, "drafts");
  if (!existsSync(drafts)) continue;
  for (const f of readdirSync(drafts).filter((x) => x.endsWith(".html.json"))) {
    const spec = readSection(JSON.parse(readFileSync(join(drafts, f), "utf8")));
    if (!spec || spec.version !== 3 || !spec.blocks) continue;
    const id = `${round}__${f.replace(/\.html\.json$/, "")}`;
    const mod = spec.module ?? 1;
    const r = fitReport({ sub: spec.sub, blocks: spec.blocks, results: spec.results, resultCards: spec.resultCards, module: mod });
    const head = frameHeight(spec.sub.title, [], 0, {}, spec.sub.markers);
    const groups = rowBlocks(spec.blocks);
    est[id] = {
      round,
      card: f.replace(/\.html\.json$/, "").replace("_", "/"),
      module: mod,
      budget: r.budget,
      total: r.total,
      head: Math.round(head * 10) / 10,
      result: Math.round((frameHeight(spec.sub.title, spec.results, spec.resultCards?.length ?? 0, { chart: (spec.resultChart?.series.length ?? 0) >= 2, band: spec.resultBand || "" }, spec.sub.markers) - head) * 10) / 10,
      rows: r.rows.map((row, i) => ({
        ...row,
        variants: (groups[i] ?? []).map((b) => (b.variant ? `${b.kind}:${b.variant}` : b.kind)).join("+"),
        cells: (groups[i] ?? []).map((b) => b.cells.length || b.rows.length || b.items.length).join("+"),
        figures: (groups[i] ?? []).flatMap((b) => (b.figures ?? []).map((g) => `${g.kind}:${g.pos}:${g.size}`)).join(","),
      })),
    };
    writeFileSync(join(out, `${id}.html`), sectionDocument(spec, [], { year: 2026, generatedAt: "", model: "행 실측용" }, { marks: true }));
  }
}
writeFileSync(join(out, "est.json"), JSON.stringify(est, null, 1));
console.log(`${Object.keys(est).length}장 → ${out}`);
