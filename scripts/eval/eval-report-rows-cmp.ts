// 판면 어림 보정용(수동 실행 전용): eval-report-rows.ts의 est.json(어림)과 ego lite 실측 measured.json을 행마다 맞대어
// 블록 종류(모양)별 오차(어림 − 실측, mm·%)를 냄. 실행: node scripts/eval/eval-report-rows-cmp.ts <rows 폴더> [--rows 종류]
import { readFileSync } from "node:fs";
import { join } from "node:path";


const [dir, flag, want] = process.argv.slice(2);
const est = JSON.parse(readFileSync(join(dir, "est.json"), "utf8"));
const got = JSON.parse(readFileSync(join(dir, "measured.json"), "utf8"));

/** eval-report-rows.ts가 est.json에 쓴 평가 한 건(필요한 칸만) */
interface EstEntry {
  module: number;
  total: number;
  head: number;
  result: number;
  rows: Array<{ label: string; mm: number; variants: string; cells: string; figures: string }>;
}

interface Row { id: string; key: string; label: string; est: number; got: number; figures: string; cells: string }
const rows: Row[] = [];
const totals: Array<{ id: string; module: number; est: number; got: number }> = [];
const parts: Record<string, Array<[number, number]>> = { head: [], result: [] };
for (const [id, e] of Object.entries<EstEntry>(est)) {
  const g = got[id];
  if (!g || g.rows.length !== e.rows.length) {
    console.log(`건너뜀 ${id}: 행 수 어림 ${e.rows.length} · 실측 ${g?.rows.length}`);
    continue;
  }
  totals.push({ id, module: e.module, est: e.total, got: g.frame });
  parts.head.push([e.head, g.head]);
  parts.result.push([e.result, g.result]);
  e.rows.forEach((r, i) => rows.push({ id, key: `${r.label ? "사다리" : "전폭"} ${r.variants}${r.figures ? " +그림" : ""}`, label: r.label, est: r.mm, got: g.rows[i], figures: r.figures, cells: r.cells }));
}

const stat = (xs: Array<[number, number]>) => {
  const d = xs.map(([a, b]) => a - b);
  const pct = xs.map(([a, b]) => (b > 0 ? (a - b) / b : 0));
  const mean = (v: number[]) => v.reduce((n, x) => n + x, 0) / v.length;
  return { n: xs.length, dmm: mean(d), pct: mean(pct), min: Math.min(...pct), max: Math.max(...pct), abs: mean(pct.map(Math.abs)) };
};
const fmt = (s: ReturnType<typeof stat>) => `${String(s.n).padStart(3)} | ${s.dmm >= 0 ? "+" : ""}${s.dmm.toFixed(1).padStart(5)}mm | ${(s.pct * 100).toFixed(1).padStart(6)}% | ${(s.min * 100).toFixed(0).padStart(4)}~${(s.max * 100).toFixed(0).padStart(3)}% | |오차| ${(s.abs * 100).toFixed(1)}%`;

if (flag === "--rows") {
  for (const r of rows.filter((x) => x.key.includes(want ?? ""))) console.log(`${r.id} | ${r.key} | 칸 ${r.cells} | 어림 ${r.est} · 실측 ${r.got} | ${(((r.est - r.got) / r.got) * 100).toFixed(0)}% ${r.figures}`);
  process.exit(0);
}

console.log(`판면 합계: ${fmt(stat(totals.map((t) => [t.est, t.got])))}`);
for (const m of [0.5, 1, 1.5]) {
  const t = totals.filter((x) => x.module === m);
  if (t.length) console.log(`  ${m}쪽: ${fmt(stat(t.map((x) => [x.est, x.got])))}`);
}
console.log(`제목부:   ${fmt(stat(parts.head))}`);
console.log(`추진성과: ${fmt(stat(parts.result))}`);
console.log("\n행 종류 | 수 | 평균 오차(어림−실측) | 평균 % | 범위 | 절대 오차 평균");
const by = new Map<string, Array<[number, number]>>();
for (const r of rows) by.set(r.key, [...(by.get(r.key) ?? []), [r.est, r.got]]);
for (const [k, xs] of [...by].sort((a, b) => b[1].length - a[1].length)) console.log(`${k.padEnd(34)} ${fmt(stat(xs))}`);
