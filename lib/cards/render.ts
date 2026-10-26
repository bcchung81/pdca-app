// 과제관리카드 원본 양식 렌더러 — 초기 변환의 render_static.py(파이썬 — 2026-09-28에 지워 git 이력에만)를 그대로 옮긴 것.
// 보기 모드 출력은 정적 조각(static/*.html)과 바이트까지 같아야 합니다(render.test.ts).
// 편집 모드(editable)는 글줄·칸마다 JSON 경로(data-p)와 contenteditable을 더하고, 체크 상자에 토글 표지를 답니다.

import { isMgmtCard } from "./mgmt-card.ts";
import { renderMgmtCard } from "./render-mgmt.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

export interface RenderOptions {
  /** 글 칸마다 JSON 경로(data-p) + contenteditable */
  editable?: boolean;
  /** 경로만 붙이고 편집은 막음(읽기 전용 화면에서 칸 고르기용) */
  selectable?: boolean;
  /** 편집 모드에서 잠글 경로 앞부분(예: 확정된 고정 영역 "act"·"plan"·"kpi") — 고를 수는 있고 고칠 수는 없음 */
  locked?: string[];
}

const IMG_PREFIX = "../";
const CIRC = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳➀➁➂➃➄➅➆➇➈➉❶❷❸❹❺❻❼❽❾❿➊➋➌➍➎➏➐➑➒➓";
const MARK_RE = new RegExp(`^([∙•▪◦●■\\-–－${CIRC}]?\\s*)([\\s\\S]*)$`, "u");
const BOX = /[☑□☐]/;

export function esc(s: unknown): string {
  return (s === null || s === undefined ? "" : String(s))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const nl2br = (s: unknown) => esc(s).replace(/\n/g, "<br>");
const cpLen = (s: string) => [...s].length;
const pyStrip = (s: string) => s.replace(/^\s+|\s+$/gu, "");

/** 파이썬 '%.2f'와 같은 반올림(정확한 이진값 기준, 딱 절반이면 짝수 쪽) */
export function pyFixed2(v: number): string {
  const s = v.toFixed(60);
  const [int, frac] = s.split(".");
  const keep = frac.slice(0, 2);
  const rest = frac.slice(2);
  let up = false;
  if (rest[0] > "5") up = true;
  else if (rest[0] === "5") up = /[1-9]/.test(rest.slice(1)) || Number(keep[1]) % 2 === 1;
  if (!up) return `${int}.${keep}`;
  const cents = BigInt(int + keep) + BigInt(1);
  const t = cents.toString().padStart(3, "0");
  return `${t.slice(0, -2)}.${t.slice(-2)}`;
}

/** 편집 모드에서 붙이는 속성 */
export class Ctx {
  readonly editable: boolean;
  readonly selectable: boolean;
  readonly locked: string[];
  constructor(editable: boolean, selectable: boolean, locked: string[] = []) {
    this.editable = editable || selectable;
    this.selectable = selectable && !editable;
    this.locked = locked;
  }
  isLocked(path: string): boolean {
    return this.locked.some((p) => path === p || path.startsWith(`${p}.`));
  }
  ed(path: string): string {
    if (!this.editable) return "";
    if (this.selectable) return ` data-p="${esc(path)}" tabindex="0"`;
    // 잠긴 칸(고정 영역): 고를 수는 있지만 고칠 수 없음
    if (this.isLocked(path)) return ` data-p="${esc(path)}" tabindex="0" data-locked="1"`;
    return ` data-p="${esc(path)}" contenteditable="plaintext-only" spellcheck="false"`;
  }
  /** 편집 모드의 양식·식별 칸(고칠 수 없음): 마우스를 올리면 까닭이 보이게 */
  fixed(reason: string): string {
    return this.editable && !this.selectable ? ` data-fixed="1" title="${esc(reason)}"` : "";
  }
  /** 체크 상자 토글 경로(잠긴 칸은 없음) */
  tg(path: string): string | undefined {
    return this.editable && !this.isLocked(path) ? path : undefined;
  }
}

function boxSpan(g: string, toggle?: string): string {
  const on = g === "☑";
  const t = toggle ? ` data-toggle="${esc(toggle)}"` : "";
  return `<span class="kc-cb" role="img" aria-label="${on ? "선택함" : "선택 안 함"}"${t}>${on ? "☑" : "□"}</span>`;
}

/** '☑ 고도화과제(기존)' → 상자 + (체크된 것은) 괄호·쌍점 앞까지 굵게. toggle: 편집 모드에서 상자 토글 경로 */
function fmtCheck(text: unknown, toggle?: string): string {
  const parts = String(text).split(/([☑□☐])/);
  const out: string[] = [];
  let checked = false;
  let box = 0;
  parts.forEach((p, i) => {
    if (p === "☑" || p === "□" || p === "☐") {
      out.push(boxSpan(p, toggle ? `${toggle}#${box}` : undefined));
      box += 1;
      checked = p === "☑";
      return;
    }
    if (!p) return;
    const m = /^(\s*)(주요사업\s*)?([^(:,，]*)([\s\S]*)$/.exec(p);
    if (m && i > 0) {
      const head = m[3];
      out.push(esc(m[1]) + (m[2] !== undefined ? '<sup class="kc-tiny">주요사업</sup>' : "") + (checked && pyStrip(head) ? `<b>${esc(head)}</b>` : esc(head)) + esc(m[4]));
    } else out.push(esc(p));
    checked = false;
  });
  return out.join("");
}

export function lineClass(s: string): string {
  if (cpLen(pyStrip(s)) <= 1) return "plain";
  const c = [...s][0] ?? "";
  if (c && "∙•▪◦●■".includes(c)) return "b1";
  if (c && "-–－".includes(c)) return "b2";
  if (c && "·‧･・".includes(c)) return "b3";
  if (c && "※*".includes(c)) return "note";
  if (c && "→⇒☞▶▷➜➛⇨".includes(c)) return "arr";
  if (c === "★") return "star";
  if (c && "✔✓".includes(c)) return "chk";
  if (c && CIRC.includes(c)) return "num";
  if (/^[가-하]\.\s/.test(s)) return "b2k";
  return "plain";
}

function balancedHead(s: string): [string, string] | null {
  if (!s.startsWith("(")) return null;
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") d += 1;
    else if (s[i] === ")") {
      d -= 1;
      if (d === 0) return [s.slice(0, i + 1), s.slice(i + 1)];
    }
  }
  return null;
}

function bracketHead(s: string): [string, string] | null {
  if (!s.startsWith("[")) return null;
  const i = s.indexOf("]");
  return i > 0 ? [s.slice(0, i + 1), s.slice(i + 1)] : null;
}

/** 글줄의 굵은 머리말: [글머리+공백, 괄호 머리, 나머지] — 원본 양식(fmtLine)과 한글 내려받기(hwp/form.ts)가 같은 규칙을 씀 */
export function lineHead(s: string, cls: string): [string, string, string] | null {
  if (cls !== "b1" && cls !== "num" && cls !== "b2") return null;
  const mk = MARK_RE.exec(s);
  if (!mk) return null;
  const head = balancedHead(mk[2]) ?? bracketHead(mk[2]);
  return head && cpLen(head[0]) <= 40 ? [mk[1], head[0], head[1]] : null;
}

const fmtTail = (s: string) => (BOX.test(s) ? fmtCheck(s) : esc(s));

function fmtLine(s: string, cls: string): string {
  if (cls === "star") {
    const m = /^★\s*(\([^)]*\))?([\s\S]*)$/.exec(s);
    const lab = "★" + (m && m[1] ? ` ${m[1]}` : "");
    return `<span class="kc-sl">${esc(lab)}</span>${esc(m ? m[2] : s.slice(1))}`;
  }
  const lh = lineHead(s, cls);
  if (lh) return `${esc(lh[0])}<b>${esc(lh[1])}</b>${fmtTail(lh[2])}`;
  if (BOX.test(s)) return fmtCheck(s);
  return esc(s);
}

export function renderLines(x: Ctx, lines: Json, path: string): string {
  if (!lines || lines.length === 0) {
    // 편집 모드: 빈 칸에도 첫 줄을 둬서 쓸 수 있게
    return x.editable ? `<div class="kc-lines"><p class="kc-ln kc-plain" data-empty="1"${x.ed(`${path}.0`)}></p></div>` : "";
  }
  const onlyDash = lines.length === 1 && typeof lines[0] === "string" && ["-", "–"].includes(pyStrip(lines[0]));
  const out: string[] = [];
  lines.forEach((ln: Json, i: number) => {
    if (typeof ln === "string") {
      const cls = onlyDash ? "center" : lineClass(ln);
      out.push(`<p class="kc-ln kc-${cls}"${x.ed(`${path}.${i}`)}>${fmtLine(ln, cls)}</p>`);
    } else if (ln && typeof ln === "object" && "table" in ln) {
      out.push(renderTable(x, ln.table, `${path}.${i}.table`));
    } else if (ln && typeof ln === "object" && "image" in ln) {
      const im = ln.image;
      if (im.src) out.push(`<img class="kc-fig" src="${esc(IMG_PREFIX + String(im.src).replace(/\\/g, "/"))}" alt="원본 그림 (${esc(im.kordoc)})" loading="lazy">`);
      else out.push(`<p class="kc-ln kc-note">[그림: ${esc(im.kordoc)}]</p>`);
    }
  });
  return `<div class="kc-lines">${out.join("")}</div>`;
}

function plain(lines: Json): string {
  const out: string[] = [];
  for (const ln of lines ?? []) {
    if (typeof ln === "string") out.push(ln);
    else if (ln && typeof ln === "object" && "table" in ln) for (const row of ln.table.rows) for (const c of row) out.push(plain(c.lines));
  }
  return out.join(" ");
}

function gridColumns(rows: Json[][]): [number, Map<number, number>] {
  const occ = new Set<string>();
  let width = 0;
  const maxlen = new Map<number, number>();
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while (occ.has(`${r},${c}`)) c += 1;
      const cs = Math.max(1, cell.colspan ?? 1);
      const rs = Math.max(1, cell.rowspan ?? 1);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) occ.add(`${r + dr},${c + dc}`);
      if (cs === 1) {
        const text = plain(cell.lines);
        const longest = Math.max(...text.split(" ").map(cpLen), 0);
        const total = cpLen(text);
        maxlen.set(c, Math.max(maxlen.get(c) ?? 0, Math.min(total, 60), longest));
      }
      c += cs;
      width = Math.max(width, c);
    }
  });
  return [width, maxlen];
}

function colgroupFor(rows: Json[][]): string {
  const [n, maxlen] = gridColumns(rows);
  if (n <= 0) return "";
  const w = Array.from({ length: n }, (_, i) => Math.min(Math.max(maxlen.get(i) ?? 8, 4), 40));
  const tot = w.reduce((s, v) => s + v, 0);
  return `<colgroup>${w.map((v) => `<col style="width:${pyFixed2((v / tot) * 100)}%">`).join("")}</colgroup>`;
}

function cellAttrs(c: Json): string {
  let a = "";
  if ((c.colspan ?? 1) > 1) a += ` colspan="${c.colspan}"`;
  if ((c.rowspan ?? 1) > 1) a += ` rowspan="${c.rowspan}"`;
  return a;
}

function renderTable(x: Ctx, t: Json, path: string): string {
  const rows = t.rows;
  if (rows.length === 1 && rows[0].length === 1) return `<div class="kc-ntbox">${renderLines(x, rows[0][0].lines, `${path}.rows.0.0.lines`)}</div>`;
  const h = ['<table class="kc-nt">', colgroupFor(rows), "<tbody>"];
  rows.forEach((row: Json[], r: number) => {
    h.push("<tr>");
    row.forEach((c, ci) => {
      const ls = c.lines;
      if (ls.length === 1 && ls[0] && typeof ls[0] === "object" && "table" in ls[0] && ls[0].table.rows.length === 1 && ls[0].table.rows[0].length === 1) {
        h.push(`<th${cellAttrs(c)}>${renderLines(x, ls[0].table.rows[0][0].lines, `${path}.rows.${r}.${ci}.lines.0.table.rows.0.0.lines`)}</th>`);
        return;
      }
      const tag = c.th ? "th" : "td";
      h.push(`<${tag}${cellAttrs(c)}>${renderLines(x, ls, `${path}.rows.${r}.${ci}.lines`)}</${tag}>`);
    });
    h.push("</tr>");
  });
  h.push("</tbody></table>");
  return h.join("");
}

function renderGrid(x: Ctx, g: Json, path: string): string {
  const rows = g.rows;
  const h = ['<table class="kc-sgrid">', colgroupFor(rows), "<tbody>"];
  rows.forEach((row: Json[], r: number) => {
    h.push("<tr>" + row.map((c, ci) => `<td${cellAttrs(c)}>${renderLines(x, c.lines, `${path}.rows.${r}.${ci}.lines`)}</td>`).join("") + "</tr>");
  });
  h.push("</tbody></table>");
  return h.join("");
}

const pdcaLabel = (key: string, word: string, rest: string, first = false) =>
  `<div class="kc-lab kc-pdca kc-${key}${first ? " kc-first" : ""}"><div><span class="kc-pl">[<i>${word[0]}</i>${word.slice(1)}]</span>${rest}</div></div>`;
export const plainLabel = (t: string) => `<div class="kc-lab">${t}</div>`;
export const sec = (label: string, body: string, cls = "") => `<section class="kc-sec">${label}<div class="kc-body${cls ? ` ${cls}` : ""}">${body}</div></section>`;

function renderHeader(x: Ctx, c: Json): string {
  const tno = c.taskNo ? `<span class="kc-tno"${x.fixed("과제번호는 카드를 가리키는 값이라 바꿀 수 없습니다(새 과제는 카드 현행화에서 등록)")}>(과제번호 : ${esc(c.taskNo)})</span>` : "";
  const form = x.fixed("양식 고정 칸입니다");
  const person = esc(c.manager || "") + (c.writer ? ` / ${esc(c.writer)}` : "");
  return (
    '<table class="kc-hdr" aria-label="과제 기본정보">' +
    '<colgroup><col style="width:84px"><col><col style="width:108px"><col style="width:31%"></colgroup>' +
    `<tbody><tr><td class="kc-k" rowspan="2"${form}>과제명<br>(과제번호)</td>` +
    `<td class="kc-t" rowspan="2"><span class="kc-tt"${x.ed("title")}>${esc(c.title)}</span> ${tno}</td>` +
    `<td class="kc-l"${form}>부서<small>(팀)</small></td><td class="kc-v"${x.ed("deptText")}>${esc(c.deptText || c.department || "")}</td></tr>` +
    `<tr><td class="kc-l"${form}>관리자/작성자</td><td class="kc-v"${x.ed("@person")}>${person}</td></tr></tbody></table>`
  );
}

export function renderOverview(x: Ctx, o: Json): string {
  const cells: string[] = o.cells || [];
  const isR1 = (t: string) => /고도화과제|신규과제|단기과제|중장기과제/.test(t);
  const r1 = cells.map((t, i) => [t, i] as const).filter(([t]) => isR1(t));
  const r2 = cells.map((t, i) => [t, i] as const).filter(([t]) => !isR1(t));
  const n = Math.max(r1.length, 1);
  const h = [`<table class="kc-frm kc-ov"><colgroup>${Array.from({ length: n }, () => `<col style="width:${pyFixed2(100 / n)}%">`).join("")}</colgroup><tbody><tr>`];
  // 과제 구분 칸: 상자를 누르면 바뀌고, 글자도 고칠 수 있음
  for (const [t, i] of r1) h.push(`<td${x.ed(`overview.cells.${i}`)}>${fmtCheck(t, x.tg(`overview.cells.${i}`))}</td>`);
  h.push("</tr><tr>");
  let spans: number[] = [];
  if (r2.length) {
    const base = Math.floor(n / r2.length);
    const extra = n % r2.length;
    spans = r2.map((_, i) => Math.max(1, base + (i < extra ? 1 : 0)));
  }
  r2.forEach(([t, i], k) => {
    const sp = spans[k];
    const attr = sp > 1 ? ` colspan="${sp}"` : "";
    const m = /^(.*?투입\s*인력)(.*)$/.exec(t);
    if (m) h.push(`<td class="kc-c"${attr}${x.ed(`overview.cells.${i}`)}><b>${esc(m[1])}</b>${esc(m[2])}</td>`);
    else h.push(`<td${attr}${x.ed(`overview.cells.${i}`)}>${fmtCheck(t, x.tg(`overview.cells.${i}`))}</td>`);
  });
  h.push("</tr></tbody></table>");
  return h.join("");
}

const KPI_LABEL: Record<string, string> = { name: "지표명 (단위)", formula: "산식", prev: "‘25년 실적", target: "‘26년 목표", expected: "’26년 실적(예상)" };
const KPI_W: Record<string, number> = { name: 30, formula: 34, prev: 18, target: 18, expected: 18 };

export function renderKpi(x: Ctx, k: Json): string {
  const h: string[] = [];
  if (k.categoriesText) {
    const segs = String(k.categoriesText)
      .split(/(?=[☑□☐])/)
      .map(pyStrip)
      .filter(Boolean);
    let box = 0;
    const spans = segs.map((s) => {
      const html = fmtCheck(s, x.tg("kpi.categoriesText")).replace(/data-toggle="kpi\.categoriesText#(\d+)"/g, (_m, d) => `data-toggle="kpi.categoriesText#${box + Number(d)}"`);
      box += (s.match(/[☑□☐]/g) ?? []).length;
      return `<span>${html}</span>`;
    });
    h.push(`<div class="kc-cats"${x.ed("kpi.categoriesText")}>${spans.join("")}</div>`);
  }
  const cols: string[] = k.columns || ["name", "formula", "prev", "target"];
  const tot = cols.reduce((s, c) => s + KPI_W[c], 0);
  h.push(`<table class="kc-frm kc-kpi"><colgroup>${cols.map((c) => `<col style="width:${pyFixed2((KPI_W[c] / tot) * 100)}%">`).join("")}</colgroup><thead><tr>`);
  const headers = k.headers || {};
  for (const c of cols) h.push(`<th scope="col"${x.ed(`kpi.headers.${c}`)}>${esc(headers[c] || KPI_LABEL[c])}</th>`);
  h.push("</tr></thead><tbody>");
  (k.rows || []).forEach((r: Json, i: number) => {
    h.push("<tr>" + cols.map((c) => `<td${x.ed(`kpi.rows.${i}.${c === "name" ? "nameRaw" : c}`)}>${nl2br((c === "name" ? r.nameRaw : r[c]) || "")}</td>`).join("") + "</tr>");
  });
  if (!k.rows || k.rows.length === 0) h.push(`<tr><td colspan="${cols.length}">&nbsp;</td></tr>`);
  h.push("</tbody></table>");
  if (k.notes && k.notes.length) h.push(`<div class="kc-kpinote">${renderLines(x, k.notes, "kpi.notes")}</div>`);
  return h.join("");
}

function renderStrategy(x: Ctx, s: Json): string {
  const nat = (s.nationalAgenda || [])
    .map((a: Json, i: number) => {
      const badges = (a.badges || []).map((b: string, j: number) => `<span class="kc-badge"${x.ed(`strategy.nationalAgenda.${i}.badges.${j}`)}>${esc(b)}</span>`).join("");
      const title = x.editable ? `<span${x.ed(`strategy.nationalAgenda.${i}.title`)}>${esc(a.title || "")}</span>` : esc(a.title || "");
      return `<p>${badges}${title}</p>`;
    })
    .join("");
  let ai = "";
  const a = s.ai || {};
  if (a.text !== null && a.text !== undefined) {
    const parts = String(a.text)
      .split("\n")
      .map((ln, i) => {
        const g = /^[☑□☐]/.exec(ln);
        const t = ln.replace(/^[☑□☐]\s*/, "");
        const body = t && !/해당\s*사항\s*없음/.test(t) ? `<span class="kc-hl">${esc(t)}</span>` : esc(t);
        return (i ? "<br>" + (g ? boxSpan(g[0]) : "") : "") + body;
      });
    const head = a.checked !== null && a.checked !== undefined ? boxSpan(a.checked ? "☑" : "□", x.tg("strategy.ai.checked")) : "";
    ai = x.editable ? `${head}<span${x.ed("strategy.ai.text")}>${parts.join("")}</span>` : head + parts.join("");
  }
  // 머리 글자: 카드에 따로 적은 값이 없으면 9.16 양식 글자(보기 출력은 원본 조각과 같음)
  const hd = s.headers || {};
  return (
    '<table class="kc-frm"><colgroup><col style="width:36%"><col style="width:32%"><col style="width:32%"></colgroup>' +
    `<thead><tr><th scope="col"${x.ed("strategy.headers.national")}>${esc(hd.national || "국정과제(정부정책) 연계성")}</th><th scope="col"${x.ed("strategy.headers.esg")}>${esc(hd.esg || "ESG 연계성")}</th>` +
    `<th scope="col"${x.ed("strategy.headers.ai")}>${esc(hd.ai || "AI활용(AX 협의체 등)")}</th></tr></thead><tbody><tr>` +
    `<td class="kc-agenda">${nat}</td><td class="kc-c"${x.ed("strategy.esgText")}>${s.esgText ? fmtCheck(s.esgText, x.tg("strategy.esgText")) : ""}</td><td>${ai}</td></tr></tbody></table>`
  );
}

/** 두 칸 표(머리 + 글줄). hp1·hp2 = 머리 글자 편집 경로 */
function twoCol(x: Ctx, h1: string, l1: Json, p1: string, h2: string, l2: Json, p2: string, hp1: string, hp2: string): string {
  if (l1 === null || l1 === undefined) {
    return `<table class="kc-frm"><colgroup><col style="width:100%"></colgroup><thead><tr><th scope="col"${x.ed(hp2)}>${esc(h2)}</th></tr></thead><tbody><tr><td class="kc-top">${renderLines(x, l2, p2)}</td></tr></tbody></table>`;
  }
  return (
    '<table class="kc-frm kc-two"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>' +
    `<thead><tr><th scope="col"${x.ed(hp1)}>${esc(h1)}</th><th scope="col"${x.ed(hp2)}>${esc(h2)}</th></tr></thead>` +
    `<tbody><tr><td>${renderLines(x, l1, p1)}</td><td>${renderLines(x, l2, p2)}</td></tr></tbody></table>`
  );
}

function renderAct(x: Ctx, a: Json): string {
  const hd = a.headers || {};
  return twoCol(x, hd.findings || "경영평가 지적사항", a.findings, "act.findings", hd.self || "’25년 추진 결과에 대한 자체평가", a.selfAssessment || [], "act.selfAssessment", "act.headers.findings", "act.headers.self");
}

export function renderDo(x: Ctx, d: Json): string {
  const h = [d.grid ? renderGrid(x, d.grid, "do.grid") : renderLines(x, d.lines, "do.lines")];
  (d.monthly || []).forEach((m: Json, i: number) => {
    const toks: string[] = m.periodTokens && m.periodTokens.length ? m.periodTokens : [m.period];
    const badges = toks.map((t) => (/[~∼]/.test(t) ? '<span class="kc-tl" aria-label="부터">~</span>' : `<span class="kc-mb">${esc(t)}</span>`)).join("");
    h.push(
      `<div class="kc-monthly" role="group" aria-label="${esc(m.period)} 추진 실적">` +
        `<div class="kc-period"${x.ed(`do.monthly.${i}.period`)}>${badges}</div><div class="kc-mitems">${renderLines(x, m.items, `do.monthly.${i}.items`)}</div></div>`,
    );
  });
  return h.join("");
}

export function renderOutcome(x: Ctx, o: Json): string {
  const hd = o.headers || {};
  return twoCol(x, hd.quantitative || "정량 성과", o.quantitative || [], "outcome.quantitative", hd.qualitative || "정성 성과(기대 효과)", o.qualitative || [], "outcome.qualitative", "outcome.headers.quantitative", "outcome.headers.qualitative");
}

function renderAx(x: Ctx, a: Json, i: number): string {
  const h = [
    `<section class="kc-axsec" aria-label="AX 연계과제 ${esc(a.no || a.seq)}">`,
    `<div class="kc-axhead"><span class="kc-axbadge">AX 연계과제${a.marker ? ` ${esc(a.marker)}` : ""}</span><span class="kc-axtitle"${x.ed(`axAttachments.${i}.title`)}>${esc(a.title || "")}</span></div>`,
    '<table class="kc-axt"><colgroup><col style="width:112px"><col></colgroup><tbody>',
  ];
  if (a.purpose !== null && a.purpose !== undefined) {
    h.push(`<tr><th scope="row"${x.fixed("양식 고정 칸입니다")}>과제 목적</th><td>${renderLines(x, String(a.purpose).split("\n"), `axAttachments.${i}.purpose~`)}</td></tr>`);
  }
  (a.sections || []).forEach((s: Json, j: number) => {
    h.push(`<tr${String(s.heading).includes("체크리스트") ? ' class="kc-cl"' : ""}><th scope="row"${x.ed(`axAttachments.${i}.sections.${j}.heading`)}>${esc(s.heading)}</th><td>${renderLines(x, s.items, `axAttachments.${i}.sections.${j}.items`)}</td></tr>`);
  });
  h.push("</tbody></table>");
  if (a.notes && a.notes.length) h.push(`<div class="kc-axnote">${renderLines(x, a.notes, `axAttachments.${i}.notes`)}</div>`);
  h.push("</section>");
  return h.join("");
}

/** 현행화 비교용(보기 모드): 카드의 한 부분만 원본 양식으로. 전체 카드 출력(renderCard)과 같은 함수를 씁니다 */
export type CardPart = "header" | "overview" | "kpi" | "strategy" | "act" | "plan" | "do" | "check" | "outcome";
export function renderPart(c: Json, part: CardPart): string {
  const x = new Ctx(false, false, undefined);
  switch (part) {
    case "header":
      return renderHeader(x, c);
    case "overview":
      return renderOverview(x, c.overview);
    case "kpi":
      return renderKpi(x, c.kpi);
    case "strategy":
      return renderStrategy(x, c.strategy);
    case "act":
      return renderAct(x, c.act);
    case "plan":
      return c.plan.grid ? renderGrid(x, c.plan.grid, "plan.grid") : renderLines(x, c.plan.lines, "plan.lines");
    case "do":
      return renderDo(x, { ...c.do, monthly: [] });
    case "check":
      return c.check.grid ? renderGrid(x, c.check.grid, "check.grid") : renderLines(x, c.check.items, "check.items");
    case "outcome":
      return renderOutcome(x, c.outcome);
  }
}
/** 현행화 비교용: [Do] 월별 실적 상자 하나 */
export function renderMonthlyBox(m: Json): string {
  return renderDo(new Ctx(false, false, undefined), { grid: null, lines: [], monthly: [m] });
}
/** 현행화 비교용: AX 연계과제 붙임 하나 */
export function renderAxPart(a: Json): string {
  return renderAx(new Ctx(false, false, undefined), a, 0);
}
/** 원본 배치 화면에서 원본에 틀이 없는(새로 는) AX 붙임을 이 양식으로 이어 그림 — 편집 표시는 renderCard와 같음 */
export function renderAxEditable(c: Json, i: number, opts: RenderOptions = {}): string {
  return renderAx(new Ctx(Boolean(opts.editable), Boolean(opts.selectable), opts.locked), c.axAttachments[i], i);
}

export function renderCard(c: Json, opts: RenderOptions = {}): string {
  if (isMgmtCard(c)) return renderMgmtCard(c, opts); // 경영관리 카드는 칸이 달라 따로 그림(render-mgmt.ts)
  const x = new Ctx(Boolean(opts.editable), Boolean(opts.selectable), opts.locked);
  const body = [
    renderHeader(x, c),
    sec(plainLabel("과제 개요"), renderOverview(x, c.overview)),
    sec(plainLabel("계량<br>성과지표"), renderKpi(x, c.kpi)),
    sec(plainLabel("전략<br>연계성"), renderStrategy(x, c.strategy)),
    sec(pdcaLabel("act", "Act", "전년도<br>환류", true), renderAct(x, c.act)),
    sec(pdcaLabel("plan", "Plan", "조치 및<br>개선방향"), c.plan.grid ? renderGrid(x, c.plan.grid, "plan.grid") : renderLines(x, c.plan.lines, "plan.lines"), "kc-pad"),
    sec(pdcaLabel("do", "Do", "추진내용"), renderDo(x, c.do), "kc-pad"),
    sec(pdcaLabel("check", "Check", "성과점검"), c.check.grid ? renderGrid(x, c.check.grid, "check.grid") : renderLines(x, c.check.items, "check.items"), "kc-pad"),
    sec(plainLabel("추진성과"), renderOutcome(x, c.outcome)),
  ];
  const ax = (c.axAttachments || []).map((a: Json, i: number) => renderAx(x, a, i)).join("");
  return `<div class="kca-card" data-card-id="${esc(c.id)}" lang="ko">\n<article class="kc-card" aria-label="${esc(`${c.taskNo} ${c.title}`)}">${body.join("")}</article>${ax}\n</div>\n`;
}
