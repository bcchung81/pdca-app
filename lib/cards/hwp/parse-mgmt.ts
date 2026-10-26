// 경영관리 과제관리카드(한글 파일 → kordoc 마크다운) → 카드 JSON. 주요사업 카드(`parse.ts`)와 양식이 달라(Plan·Check·전략 연계성·산식 칸 없음, 「지적 및 개선방안」 칸 있음) 따로 읽되,
// 표 읽기 도구(HTML 표 → 셀·병합 격자·글줄·중첩 표)는 주요사업 파서의 것을 그대로 씁니다 — 글줄 규약(문자열·{table}·{image})이 같아야 렌더러·편집·병합 코드가 그대로 돕니다.
// 칸은 위치가 아니라 첫 칸의 이름(과제개요·전년도 환류·지적 및 개선방안·추진내용·계량 성과지표·추진성과)으로 찾고, 짝이 되는 좌·우 칸은 병합(rowspan)이 겹치는 행끼리 묶습니다(카드마다 열 수가 10~12).
// 양식 근거: 지침 13 `<경영관리_카드양식>`(칸 8개), 8월 점검 자료(260904) 43장. 입출력 없음.

import { type Cell, type Line, type Table, buildGrid, cellLines, key, plainText, splitBlocks } from "./parse.ts";

const nospace = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const strip = (s: string) => s.replace(/^[\s ]+|[\s ]+$/g, "");
const isStr = (x: Line): x is string => typeof x === "string";
const textOf = (c: Cell | undefined | null, sep = " ") => (c ? plainText(c, sep) : "");
const hasContent = (c: Cell) => cellLines(c).length > 0;

const SECTION_BY_LABEL: Array<[RegExp, string]> = [
  [/^과제개요$/, "overview"],
  [/^전년도환류$/, "feedback"],
  [/^지적및개선방안$/, "findings"],
  [/^추진내용$/, "do"],
  [/^계량성과지표$/, "kpi"],
  [/^추진성과$/, "outcome"],
];

export function sectionOfLabel(text: string): string | null {
  const t = nospace(text);
  for (const [re, name] of SECTION_BY_LABEL) if (re.test(t)) return name;
  return null;
}

/** 카드 표인가 — 첫 칸이 「과제명(과제번호)」(8-x 카드는 「과제(과제번호)」) */
export function isMgmtCardTable(t: Table | undefined): boolean {
  for (const row of t?.rows ?? []) for (const c of row) {
    const x = nospace(plainText(c));
    if (x) return /^과제(명)?\(과제번호\)/.test(x);
  }
  return false;
}

/** 「지표명(단위)」 → 이름·단위(끝 괄호 한 쌍). 괄호가 없으면 단위 없음 */
export function splitUnit(raw: string): { name: string; unit: string | null } {
  const m = /^([\s\S]*\S)\s*\(([^()]*)\)\s*$/.exec(strip(raw));
  return m ? { name: strip(m[1]), unit: strip(m[2]) || null } : { name: strip(raw), unit: null };
}

/** 「본부(팀)」 한 곳 */
export function splitDept(raw: string): { department: string; team: string } {
  const t = raw.replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
  return m ? { department: m[1].trim(), team: m[2].trim() } : { department: t, team: "" };
}

/** 괄호 밖의 「/」로 나눔 — 공동 과제는 「주관부서(팀) / 협업부서(팀)」로 적음(주관 먼저) */
export function splitOutsideParens(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "/" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 과제명 칸 「제목 (과제번호 : 지표명 N-M)」 */
export function splitTitle(raw: string): { title: string; indicatorName: string; indicatorNo: number; taskNo: string } | null {
  const flat = raw.replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s*\(\s*과제번호\s*:\s*(.+?)\s+(\d+)-(\d+)\s*\)\s*$/.exec(flat);
  return m ? { title: m[1].trim(), indicatorName: m[2].trim(), indicatorNo: Number(m[3]), taskNo: `${m[3]}-${m[4]}` } : null;
}

/** 경영관리 카드 파일인가 — 과제번호가 「(과제번호 : 지표명 N-M)」(주요사업은 「(과제번호 : 2-가)」) */
export function looksLikeMgmtFile(md: string): boolean {
  return /\(\s*과제번호\s*:\s*[^)\d]*\d+-\d+\s*\)/.test(md);
}

export interface MgmtOwner {
  department: string;
  team: string;
  manager: string;
  writer: string;
}

export interface MgmtCard {
  id: string;
  group: string;
  taskNo: string;
  title: string;
  indexTitle: string | null;
  indicatorNo: number;
  indicatorName: string;
  /** 묶음(경영전략·안전 및 책임경영·재무성과관리·조직 운영 및 관리·혁신노력과 성과) */
  bundle: string | null;
  department: string;
  team: string;
  /** 부서(팀) 칸의 글 그대로(공동 과제는 줄이 둘 이상) */
  deptText: string;
  manager: string;
  writer: string;
  /** 공동 과제의 주관 다음 협업 부서·담당자(없으면 빈 배열) */
  partners: MgmtOwner[];
  overview: { kind: string | null; term: string | null; checks: { advanced: boolean; new: boolean; shortTerm: boolean; longTerm: boolean }; cells: string[] };
  feedback: { rows: Array<{ self: Line[]; plan: Line[] }>; headers: { self: string; plan: string } };
  findings: { rows: Array<{ finding: Line[]; plan: Line[] }>; headers: { finding: string; plan: string } };
  do: { lines: Line[]; monthly: Array<{ period: string; periodTokens: string[]; periodLines: string[]; items: Line[] }> };
  kpi: { rows: Array<{ name: string; unit: string | null; prev: string; target: string; nameRaw: string; sub?: string }>; headers: { name: string; prev: string; target: string }; columns: ["name", "prev", "target"] };
  outcome: { quantitative: Line[]; qualitative: Line[]; headers: { quantitative: string; qualitative: string } };
  sectionOrder: string[];
  source: { file: string; kordocLine: number };
  parseWarnings: string[];
  raw: string;
}

const CHECKED = /^[☑✓■]/;

/** 겹치는 행 범위의 칸을 한 묶음으로(좌·우 칸의 짝 — 한 지적에 개선방안이 여러 줄, 한 개선방안에 지적이 여럿인 경우까지) */
function groupByRows(cells: Cell[]): Cell[][] {
  const sorted = [...cells].sort((a, b) => a.r - b.r || a.c - b.c);
  const groups: Cell[][] = [];
  let end = -1;
  for (const c of sorted) {
    const last = c.r + Math.max(1, c.rowspan) - 1;
    if (groups.length && c.r <= end) {
      groups[groups.length - 1].push(c);
      end = Math.max(end, last);
    } else {
      groups.push([c]);
      end = last;
    }
  }
  return groups;
}

function linesOf(cells: Cell[]): Line[] {
  return cells.flatMap((c) => cellLines(c));
}

/** 카드 표 한 장 → 카드 JSON. 읽지 못한 칸은 parseWarnings에 적고 빈 값으로 둠(조용히 지어내지 않음) */
export function parseMgmtCardTable(table: Table, ctx: { file: string; bundle: string | null; line: number; raw: string }): MgmtCard | null {
  const warnings: string[] = [];
  const occ = buildGrid(table);
  const rows = table.rows;
  const after = (row: Cell[] | undefined, re: RegExp): Cell | undefined => {
    const i = (row ?? []).findIndex((c) => re.test(nospace(textOf(c))));
    return i >= 0 ? row![i + 1] : undefined;
  };

  // 식별 칸: 과제명 · 부서(팀) · 관리자/작성자
  const titleCell = after(rows[0], /^과제(명)?\(과제번호\)/);
  const parsed = splitTitle(textOf(titleCell));
  if (!parsed) return null;
  const deptCell = after(rows[0], /^부서/) ?? after(rows[1], /^부서/);
  const peopleCell = after(rows[1], /^관리자/) ?? after(rows[0], /^관리자/);
  const deptLines = deptCell ? cellLines(deptCell).filter(isStr) : [];
  const peopleLines = peopleCell ? cellLines(peopleCell).filter(isStr) : [];
  const deptRaw = deptLines.join("\n");
  if (!deptRaw) warnings.push("부서(팀) 칸이 비었습니다");
  if (!peopleLines.length) warnings.push("관리자/작성자 칸이 비었습니다");
  const depts = deptLines.flatMap(splitOutsideParens).map(splitDept); // 공동 과제: 줄을 나누거나 「/」로 이음
  const people = peopleLines.map((l) => {
    const [m, w] = l.split("/").map((x) => x.trim());
    return { manager: m ?? "", writer: w ?? "" };
  });
  const owners: MgmtOwner[] = depts.map((d, i) => ({ ...d, manager: people[i]?.manager ?? "", writer: people[i]?.writer ?? "" }));
  if (people.length > depts.length) warnings.push(`담당자 줄(${people.length})이 부서(${depts.length})보다 많습니다`);
  const primary = owners[0] ?? { department: "", team: "", manager: people[0]?.manager ?? "", writer: people[0]?.writer ?? "" };

  // 구역: 첫 칸(열 0)의 이름이 구역을 시작하고, 병합으로 덮인 행·표지 없는 행은 앞 구역에 속함
  const sections = new Map<string, number[]>();
  const order: string[] = [];
  let cur: string | null = null;
  const headRows = Math.max(1, rows[0]?.[0]?.rowspan ?? 1); // 과제명 칸이 덮는 머리 행(부서·관리자 줄)은 구역이 아님
  rows.forEach((row, r) => {
    if (r < headRows) return;
    const c0 = occ.get(key(r, 0));
    const name = c0 && c0.r === r ? sectionOfLabel(textOf(c0)) : null;
    if (name) {
      if (sections.has(name)) warnings.push(`구역 '${name}' 이 두 번 나옴(행 ${r})`);
      else order.push(name);
      sections.set(name, [...(sections.get(name) ?? []), r]);
      cur = name;
      return;
    }
    if (!row.some(hasContent) && !(c0 && c0.r < r && c0.rowspan > 1)) {
      cur = c0 && c0.r === r ? null : cur;
      return;
    }
    if (cur === null) warnings.push(`구역 표지 없이 내용이 있는 행 ${r}`);
    else sections.get(cur)!.push(r);
  });
  for (const k of ["overview", "feedback", "findings", "do", "kpi", "outcome"]) if (!sections.has(k)) warnings.push(`「${k}」 칸을 찾지 못했습니다`);
  const cellsOf = (k: string, from = 0) => (sections.get(k) ?? []).slice(from).flatMap((r) => rows[r].filter((c) => c.c >= 1));
  const rowCells = (r: number) => rows[r].filter((c) => c.c >= 1 && hasContent(c));

  // 과제개요: 체크 4칸
  const ovCells = cellsOf("overview").filter(hasContent).map((c) => textOf(c));
  const flag = (re: RegExp) => ovCells.some((t) => re.test(nospace(t)) && CHECKED.test(t.trim()));
  const checks = { advanced: flag(/고도화/), new: flag(/신규/), shortTerm: flag(/단기/), longTerm: flag(/중장기/) };
  if (sections.has("overview") && ovCells.length !== 4) warnings.push(`과제개요 체크 칸이 ${ovCells.length}개입니다(4개여야 함)`);

  // 짝 칸(전년도 환류·지적 및 개선방안·추진성과): 머리 행의 두 칸이 좌·우 경계, 그 아래 칸을 병합이 겹치는 행끼리 묶음
  const pairs = (k: string): { headers: [string, string]; groups: Array<{ left: Line[]; right: Line[] }> } => {
    const secRows = sections.get(k) ?? [];
    const hr = secRows.find((r) => rowCells(r).length >= 2);
    if (hr === undefined) return { headers: ["", ""], groups: [] };
    const [lh, rh] = rowCells(hr);
    const data = secRows.filter((r) => r > hr).flatMap((r) => rows[r].filter((c) => c.c >= lh.c));
    const groups = groupByRows(data).map((g) => ({ left: linesOf(g.filter((c) => c.c < rh.c)), right: linesOf(g.filter((c) => c.c >= rh.c)) }));
    return { headers: [strip(textOf(lh)), strip(textOf(rh))], groups: groups.filter((g) => g.left.length || g.right.length) };
  };

  const fb = pairs("feedback");
  const fd = pairs("findings");
  const oc = pairs("outcome");
  for (const [i, g] of fd.groups.entries()) if (!g.left.length || !g.right.length) warnings.push(`지적 ${i + 1}행의 지적 또는 개선방안이 비었습니다`);
  const quant = oc.groups.flatMap((g) => g.left); // 정량·정성 짝이 여러 행이면 위에서 아래로 이어 붙임(글 순서 그대로)
  const qual = oc.groups.flatMap((g) => g.right);
  if (sections.has("outcome") && (!quant.length || !qual.length)) warnings.push("추진성과의 정량 또는 정성 칸이 비었습니다");

  // 추진내용: 본문 칸(중첩 표 포함) + 「1월~8월」 실적 행
  let doLines: Line[] = [];
  const monthly: MgmtCard["do"]["monthly"] = [];
  for (const r of sections.get("do") ?? []) {
    const cs = rowCells(r);
    const period = cs.find((c) => /^\d+월/.test(nospace(textOf(c))) && nospace(textOf(c)).length <= 12);
    const content = period ? cs.find((c) => c !== period && c.c > period.c) : undefined;
    if (period && content) {
      const toks = cellLines(period).filter(isStr);
      monthly.push({ period: toks.join(""), periodTokens: toks, periodLines: toks, items: cellLines(content) });
    } else for (const c of cs) doLines = doLines.concat(cellLines(c));
  }

  // 계량 성과지표: 머리 칸의 열 위치로 지표명·'25 실적·'26 목표를 나누고, 병합이 겹치는 행끼리 한 지표(13-2처럼 부칸이 있어도 한 지표)
  const kpiRows: MgmtCard["kpi"]["rows"] = [];
  let kpiHeaders = { name: "", prev: "", target: "" };
  const kRows = sections.get("kpi") ?? [];
  const kh = kRows.find((r) => rows[r].some((c) => /지표명/.test(nospace(textOf(c)))));
  if (sections.has("kpi")) {
    if (kh === undefined) warnings.push("계량 성과지표 머리를 찾지 못했습니다");
    else {
      const [nh, ph, th] = rowCells(kh);
      kpiHeaders = { name: strip(textOf(nh)), prev: strip(textOf(ph)), target: strip(textOf(th)) };
      const data = kRows.filter((r) => r > kh).flatMap((r) => rows[r].filter((c) => c.c >= nh.c));
      for (const g of groupByRows(data)) {
        const slot = (cs: Cell[]) =>
          [...cs]
            .sort((a, b) => a.r - b.r || a.c - b.c)
            .filter(hasContent)
            .reduce<string[]>((acc, c, i, all) => {
              const t = textOf(c, "\n");
              if (i > 0 && all[i - 1].r === c.r) acc[acc.length - 1] += ` ${t}`;
              else acc.push(t);
              return acc;
            }, [])
            .join("\n");
        // 값 칸이 둘째 줄까지 걸치고 줄마다 부칸이 있는 모양(13-2: 「4.15」가 두 줄에 걸치고 「보직자」·「직원」·「-」 칸이 줄마다 있음)에서는 첫 줄에서 시작하는 칸의 글만 지표 값으로 읽고
        // 둘째 줄부터의 부칸 글은 `sub`로 따로 둠 — 한 문자열에 합치면 화면·내려받기가 값을 칸 한 곳에 몰아 쓰고 부칸 글이 한 번 더 남아 겹쳐 보이며 다시 올리면 늘어남.
        // 지표명이 줄마다 따로 있는 모양(13-4)은 그대로 칸별로 이어 붙임(내려받기 왕복이 맞음)
        const top = Math.min(...g.map((c) => c.r));
        // 지표명 칸이 줄에 걸쳐 한 지표를 가리키고(rowspan) 둘째 줄부터는 값 칸만 있는 모양 — 지표명도 줄마다 따로 있으면(13-4) 별개 지표 묶음이라 아님
        const spanning = g.some((c) => c.c < ph.c && c.r === top && Math.max(1, c.rowspan) > 1) && !g.some((c) => c.c < ph.c && c.r > top && hasContent(c));
        const main = spanning ? g.filter((c) => c.r === top) : g;
        const later = spanning ? g.filter((c) => c.r > top && hasContent(c)) : [];
        const nameRaw = slot(main.filter((c) => c.c < ph.c));
        if (!nameRaw && !g.some(hasContent)) continue;
        const prev = slot(main.filter((c) => c.c >= ph.c && c.c < th.c));
        const target = slot(main.filter((c) => c.c >= th.c));
        const sub = later.length ? slot(later) : null;
        const { name, unit } = splitUnit(nameRaw);
        kpiRows.push({ name, unit, prev, target, nameRaw, ...(sub ? { sub } : {}) });
      }
    }
  }
  if (sections.has("kpi") && !kpiRows.length) warnings.push("계량 성과지표 행이 없습니다");
  for (const [i, k] of kpiRows.entries()) if (!k.name || (!k.prev && !k.target)) warnings.push(`계량 성과지표 ${i + 1}행에 지표명 또는 값이 없습니다`);

  const group = `경영관리${parsed.indicatorNo}`;
  return {
    id: `${group}/${parsed.taskNo}`,
    group,
    taskNo: parsed.taskNo,
    title: parsed.title,
    indexTitle: null,
    indicatorNo: parsed.indicatorNo,
    indicatorName: parsed.indicatorName,
    bundle: ctx.bundle,
    department: primary.department,
    team: primary.team,
    deptText: deptRaw,
    manager: primary.manager,
    writer: primary.writer,
    partners: owners.slice(1),
    overview: { kind: checks.advanced ? "고도화" : checks.new ? "신규" : null, term: checks.longTerm ? "중장기" : checks.shortTerm ? "단기" : null, checks, cells: ovCells },
    feedback: { rows: fb.groups.map((g) => ({ self: g.left, plan: g.right })), headers: { self: fb.headers[0], plan: fb.headers[1] } },
    findings: { rows: fd.groups.map((g) => ({ finding: g.left, plan: g.right })), headers: { finding: fd.headers[0], plan: fd.headers[1] } },
    do: { lines: doLines, monthly },
    kpi: { rows: kpiRows, headers: kpiHeaders, columns: ["name", "prev", "target"] },
    outcome: { quantitative: quant, qualitative: qual, headers: { quantitative: oc.headers[0], qualitative: oc.headers[1] } },
    sectionOrder: ["title", ...order],
    source: { file: ctx.file, kordocLine: ctx.line },
    parseWarnings: warnings,
    raw: ctx.raw,
  };
}

export interface MgmtIndexEntry {
  bundle: string;
  declared: number | null;
  tasks: Array<{ no: string; title: string; dept: string }>;
}

export interface ParsedMgmtFile {
  cards: MgmtCard[];
  /** 파일 머리의 묶음(예: 경영전략 (5개))과 지표별 과제 목록(실행과제명·담당부서) — 카드가 빠졌는지 대조용 */
  index: MgmtIndexEntry[];
  /** 읽지 못한 카드 표(과제번호를 못 읽음) */
  skipped: number;
}

/** 마크다운 전체 → 카드들. 「# [묶음]」 제목 줄이 카드의 묶음(경영전략·안전 및 책임경영…)을 알려 줌 */
export function parseMgmtMarkdown(md: string, opts: { sourceName: string; fileType?: string }): ParsedMgmtFile {
  const fileType = opts.fileType ?? (/\.hwpx$/i.test(opts.sourceName) ? "hwpx" : "hwp");
  const blocks = splitBlocks(md, fileType === "hwpx");
  const cards: MgmtCard[] = [];
  const index: MgmtIndexEntry[] = [];
  let bundle: string | null = null;
  let pending: { bundle: string; declared: number | null } | null = null;
  let skipped = 0;
  for (const b of blocks) {
    if (b.kind === "para") {
      const m = /^#+\s*\[(.+)\]$/.exec(b.text.trim());
      if (m) bundle = m[1].trim();
      continue;
    }
    const t = b.tables[0];
    if (!t) continue;
    if (isMgmtCardTable(t)) {
      const card = parseMgmtCardTable(t, { file: opts.sourceName, bundle, line: b.line, raw: b.text });
      if (card) cards.push(card);
      else skipped++;
      continue;
    }
    const first = strip(plainText(t.rows.flat().find((c) => plainText(c)) ?? null));
    const g = /^(.+?)\s*\((\d+)개\)$/.exec(first);
    if (g) {
      pending = { bundle: g[1].trim(), declared: Number(g[2]) };
    } else if (pending && nospace(first) === "지표명") {
      const tasks: MgmtIndexEntry["tasks"] = [];
      for (const row of t.rows) {
        const i = row.findIndex((c) => /^\d+-\d+\./.test(nospace(plainText(c))));
        if (i < 0) continue;
        const m = /^(\d+-\d+)\.\s*([\s\S]*)$/.exec(strip(plainText(row[i], "")));
        if (m) tasks.push({ no: m[1], title: m[2].trim(), dept: strip(textOf(row[i + 1])) });
      }
      index.push({ ...pending, tasks });
      pending = null;
    }
  }
  // 카드의 목차 제목 채우기
  const idx = new Map(index.flatMap((e) => e.tasks.map((t) => [t.no, t.title] as const)));
  for (const c of cards) c.indexTitle = idx.get(c.taskNo) ?? null;
  return { cards, index, skipped };
}
