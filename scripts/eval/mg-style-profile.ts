// 경영관리 경평 초안 「스타일 프로필」 측정 — 기준 docs/plan/경평초안-스타일-메타프롬프트.md 「스타일 프로필」 표. AI 채점·AI 호출·DB 접속 없음.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/mg-style-profile.ts <부모 폴더> [회차…]
//  부모 폴더(예: docs/analysis/eval/2026-10-29-fill)의 회차 폴더마다 *.html.json(초안 spec) + *.html.meta.json(경고·fill·select) 을 읽어
//  회차 폴더에 style.json을 쓰고, 부모 폴더의 index.html(목록 화면)을 style.json이 있는 모든 회차로 다시 씀. 회차를 안 주면 *.html.json이 있는 하위 폴더 전부.
// 기준값: <부모>/baseline.json(mg-fill-baseline.ts — 지표별 qtyPerPage·charsPerPage) + MGMT_TRACK.reportBulletChars. 파일·지표가 없으면 그 비교만 건너뜀.
// 회차 메모·제목·묶음: <부모>/notes.json { title, intro, groups: [{ name, rounds: [회차…] }], notes: { 회차: 메모 } } — 없으면 제목·묶음 없이 회차 이름만.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mgSpecHeight } from "../../lib/reports/business-layout.ts";
import { PAGE_MM, hollowBoxes } from "../../lib/reports/fit.ts";
import { REPEAT_MIN_BLOCKS, REPEAT_MIN_PARTS, figureUnits, repeatedFigures, repeatedSentences } from "../../lib/reports/repeat-figures.ts";
import { readSection } from "../../lib/reports/section.ts";
import { MGMT_TRACK } from "../../lib/tracks/index.ts";
import { type StyleChecks, type StyleProfile, type StyleRef, PERF_CELLS_MIN, PLAN_BLOCKS_MAX, SECTION_RANGE, VOLUME_RANGE, styleChecks, styleProfile } from "./mg-style-profile-core.ts";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const [parentArg, ...roundArgs] = process.argv.slice(2);
if (!parentArg) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/mg-style-profile.ts <부모 폴더> [회차…]");
  process.exit(1);
}
const parent = resolve(parentArg);
const baselinePath = join(parent, "baseline.json");
const baseline: { metrics: Record<string, { qtyPerPage: number | null; charsPerPage?: number }> } | null = existsSync(baselinePath) ? readJson(baselinePath) : null;
if (!baseline) console.log(`기준값 파일 없음(${baselinePath}) — 쪽당 글자·수량 비교는 건너뜀`);

const draftFiles = (dir: string) => readdirSync(dir).filter((n) => n.endsWith(".html.json")).sort();
const rounds = roundArgs.length ? roundArgs : readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory() && draftFiles(join(parent, d.name)).length).map((d) => d.name).sort();

/** 초안 하나의 저장 모양(style.json의 카드 항목) */
interface Entry {
  file: string;
  card: string;
  task: string;
  select: boolean;
  fill: { before: number; after: number; target: number } | null;
  profile: StyleProfile;
  checks: StyleChecks;
}

for (const round of rounds) {
  const dir = join(parent, round);
  const entries: Entry[] = [];
  for (const f of draftFiles(dir)) {
    const base = f.slice(0, -".json".length);
    const spec = readSection(readJson(join(dir, f)));
    if (!spec?.mg) {
      console.log(`건너뜀 ${round}/${f} — 경영관리 초안(spec.mg)이 아님`);
      continue;
    }
    const metaPath = join(dir, `${base}.meta.json`);
    const meta = existsSync(metaPath) ? readJson(metaPath) : {};
    const fill = meta.fill && !meta.fill.off && typeof meta.fill.after === "number" ? (meta.fill as { before: number; after: number; target: number }) : null;
    // 배정 쪽수: spec.mg.pages → fill.target ÷ 판면 높이. 둘 다 없으면 쪽당 지표는 null
    const pages = spec.mg.pages || (meta.fill?.target ? meta.fill.target / PAGE_MM.height : null);
    const targetMm = pages ? pages * PAGE_MM.height : null;
    // 분량: 앱이 보강 뒤에 잰 값 우선, 없으면 높이 어림
    const heightMm = fill ? fill.after : mgSpecHeight(spec);
    const card = String(spec.card?.id ?? base);
    const metric = /^경영관리(\d+)\//.exec(card)?.[1];
    const b = metric ? baseline?.metrics[`MG-${metric}`] : null;
    const ref: StyleRef = { charsPerPage: b?.charsPerPage ?? null, qtyPerPage: b?.qtyPerPage ?? null, bulletChars: MGMT_TRACK.reportBulletChars };
    const profile = styleProfile(
      { blocks: spec.blocks ?? [], at: spec.mg.at, parts: spec.mg.parts },
      {
        html: existsSync(join(dir, base)) ? readFileSync(join(dir, base), "utf8") : null,
        pages: pages || null,
        heightMm,
        targetMm: fill?.target ?? targetMm,
        repeatFigures: repeatedFigures(figureUnits(spec), REPEAT_MIN_BLOCKS, REPEAT_MIN_PARTS).length,
        repeatSentences: repeatedSentences(spec).length,
        hollow: hollowBoxes(spec.blocks ?? [], spec.mg.at).length,
      },
    );
    entries.push({ file: `${round}/${base}`, card, task: String(spec.task?.no ?? card), select: Boolean(meta.select), fill, profile, checks: styleChecks(profile, ref) });
  }
  writeFileSync(join(dir, "style.json"), JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), entries }, null, 1));
  console.log(`${round}: ${entries.length}개 → style.json`);
}

// ───────────── index.html ─────────────

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n1 = (v: number | null, d = 1) => (v == null ? "-" : v.toFixed(d));
/** 값 + 기준 통과 표시(✓) — 통과 아니면 값만 */
const mark = (ok: boolean | null | undefined) => (ok ? ' <b class="ok">✓</b>' : "");
const cellOf = (label: string, value: string, ok?: boolean | null) => `<td><small>${esc(label)}</small><br>${value}${mark(ok)}</td>`;
/** 절마다 값 「1/2」 */
const perSection = (p: StyleProfile, pick: (s: StyleProfile["sections"][number]) => number) => esc(p.sections.map(pick).join("/") || "-");

function rowsOf(e: Entry, label: string, note: string): string {
  const { profile: p, checks: c } = e;
  const fill = e.fill ? `보강 ${e.fill.before} → ${e.fill.after}mm` : "보강 없음";
  const volume = p.volumePct == null ? "-" : `${p.volumePct.toFixed(0)}%`;
  const title = `<td rowspan="2"><a href="${esc(e.file)}">${esc(label)}</a></td><td rowspan="2">${e.select ? "Jev 선별" : "통째로 넣기"}</td><td rowspan="2">${esc(note)}</td>`;
  const row1 = [
    cellOf("쪽당 보이는 글자", n1(p.charsPerPage, 0), c.charsPerPage),
    cellOf("쪽당 수량 토큰", n1(p.qtyPerPage), c.qtyPerPage),
    cellOf("분량(배정 대비)", `${volume}<br><small>${esc(fill)}</small>`, c.volume),
    cellOf("칸 불릿 수 · 평균 길이", `${p.bullets}개 · ${n1(p.bulletAvgLen)}자`, c.bulletAvgLen),
    cellOf("표 값 칸", String(p.tableValueCells)),
    cellOf("빈 칸", String(p.hollow), c.hollow),
  ].join("");
  const row2 = [
    cellOf("절 수", String(p.sections.length), c.sections),
    cellOf("절 제목에 수치", esc(p.sections.map((s) => (s.titleHasFigure ? "O" : "X")).join("/") || "-"), c.titlesFigure),
    cellOf("절마다 데이터 블록", perSection(p, (s) => s.dataBlocks), c.dataBlocks),
    cellOf("절마다 추진성과 수치 칸", perSection(p, (s) => s.perfCells), c.perfCells),
    cellOf("절마다 계획 블록", perSection(p, (s) => s.planBlocks), c.planBlocks),
    cellOf("반복 수치 · 문장", `${p.repeatFigures} · ${p.repeatSentences}`, c.repeatFigures && c.repeatSentences),
  ].join("");
  return `<tr>${title}${row1}</tr>\n<tr>${row2}</tr>`;
}

interface Notes {
  title?: string;
  intro?: string;
  groups?: Array<{ name: string; rounds: string[] }>;
  notes?: Record<string, string>;
}
const notesPath = join(parent, "notes.json");
const notes: Notes = existsSync(notesPath) ? readJson(notesPath) : {};

// style.json이 있는 모든 회차(이번에 안 돌린 회차도 표에 남김)
const all = new Map<string, Entry[]>();
for (const d of readdirSync(parent, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort()) {
  const p = join(parent, d, "style.json");
  if (existsSync(p)) all.set(d, readJson(p).entries as Entry[]);
}
const grouped = new Set((notes.groups ?? []).flatMap((g) => g.rounds));
const groups = [...(notes.groups ?? []), ...(grouped.size === all.size || [...all.keys()].every((k) => grouped.has(k)) ? [] : [{ name: "그 밖의 회차", rounds: [...all.keys()].filter((k) => !grouped.has(k)) }])];

const body = groups
  .map((g) => {
    const rows = g.rounds
      .flatMap((r) => (all.get(r) ?? []).map((e, _, list) => rowsOf(e, list.length > 1 ? `${r} · ${e.task}` : r, notes.notes?.[r] ?? "")))
      .join("\n");
    return rows ? `<tr class="sep"><td colspan="9">${esc(g.name)}</td></tr>\n${rows}` : "";
  })
  .join("\n");

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(notes.title ?? "경평 초안 결과")}</title>
<style>
body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;margin:32px;color:#1f2328;background:#fff}
h1{font-size:20px;margin:0 0 6px}p{color:#57606a;margin:0 0 18px;font-size:14px}
table{border-collapse:collapse;font-size:14px;min-width:640px}th,td{border:1px solid #d0d7de;padding:6px 10px;text-align:left;vertical-align:top}
th{background:#f6f8fa}a{color:#00699E;font-weight:600}tr.sep td{background:#f6f8fa;font-weight:600}
td small{color:#57606a;font-size:11px}.ok{color:#1a7f37}
</style></head><body>
<h1>${esc(notes.title ?? "경평 초안 결과")}</h1>
<p>${esc(notes.intro ?? "")}</p>
<p>지표는 결정론으로 잰 값이고 AI 채점이 아닙니다. 기준을 넘으면 ✓ — 쪽당 글자·수량은 2025 같은 지표, 불릿 평균은 ${MGMT_TRACK.reportBulletChars}자, 절 ${SECTION_RANGE.min}~${SECTION_RANGE.max}개·절마다 제목에 수치(O)·데이터 블록 1개 이상·추진성과 수치 칸 ${PERF_CELLS_MIN}개 이상·계획 블록 ${PLAN_BLOCKS_MAX}개 이하(절 순서 「가/나」), 분량 ${VOLUME_RANGE.min}~${VOLUME_RANGE.max}%, 반복·빈 칸 0. 비교 기준이 없으면 값만 보입니다.</p>
<table>
<tr><th>초안</th><th>공통 지식</th><th>메모</th><th colspan="6">지표</th></tr>
${body}
</table>
</body></html>
`;
writeFileSync(join(parent, "index.html"), html);
console.log(`→ ${join(parent, "index.html")}`);
