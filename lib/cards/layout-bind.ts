// 카드 JSON ↔ 원본 배치(한글 문단) 잇기. 칸 위치가 아니라 글 내용으로 잇습니다(순서 보존).
//  · 편집 칸(target): 원본 양식 렌더러(render.ts)의 편집 모드 출력에서 경로·글을 뽑음 — 경로 규칙을 한 곳에만 둠
//  · 문단(unit): 배치의 문단(문서 순서, 표 칸·글상자 속 문단 포함)
//  · 잇기(anchor): 두 순서열을 글 유사도로 맞춤(같은 글 > 포함 > 비슷함, 한 칸 = 여러 문단 가능). 맞춘 문단에 그때의 경로를 적어 둠
//    (적재·현행화 때 한 번). 화면은 이 표시와 지금 카드 JSON을 목록마다 다시 맞춰 그림(layout-render.ts)
// 판단이 끼면 안 되는 일이라 AI를 쓰지 않는 결정론 코드입니다.

import type { CardLayout } from "../hwp/layout.ts";
import type { Para, Shape, Table } from "../hwp/model.ts";
import { bigramDice as dice } from "../knowledge/similarity.ts";
import { renderCard } from "./render.ts";
import type { LooseJson } from "../loose-json.ts";

// ───────────────────────── 편집 칸(target)

export interface Target {
  path: string;
  /** 화면에 보이는 글(원본 양식 렌더러 기준 — 머리 글자 기본값·체크 상자 포함) */
  text: string;
  /** 글줄(Enter로 줄 추가·빈 줄 지우기) */
  line: boolean;
  locked: boolean;
  /** 빈 목록 자리표시 */
  empty: boolean;
  /** 이 칸 안 체크 상자 토글 경로(순서대로) */
  toggles: string[];
  /** 이 칸 바로 앞 따로 선 토글(예: AI 활용 체크 상자) */
  before: string[];
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: "\u00a0" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (_m, k: string) => ENT[k]);
const VOID = new Set(["br", "img", "col", "input", "hr", "meta", "wbr"]);

/** 원본 양식 렌더러의 편집 모드 HTML → 편집 칸 목록(문서 순서) */
export function targetsOf(card: LooseJson, locked?: string[]): Target[] {
  const html = renderCard(card, { editable: true, locked });
  const out: Target[] = [];
  const stack: { tag: string; target: Target | null }[] = [];
  let cur: Target | null = null;
  let pendingToggles: string[] = [];
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  const text = (s: string) => {
    if (cur && s) cur.text += unescape(s);
  };
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    text(html.slice(last, m.index));
    last = TAG.lastIndex;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      // 닫는 태그: 같은 이름의 가장 가까운 여는 태그까지
      for (let k = stack.length - 1; k >= 0; k--)
        if (stack[k].tag === tag) {
          if (stack[k].target && stack[k].target === cur) cur = null;
          stack.length = k;
          break;
        }
      continue;
    }
    const attrs = m[3];
    if (tag === "br") {
      text("\n");
      continue;
    }
    const tg = /\sdata-toggle="([^"]*)"/.exec(attrs);
    if (tg) {
      if (cur) cur.toggles.push(unescape(tg[1]));
      else pendingToggles.push(unescape(tg[1]));
    }
    const dp = /\sdata-p="([^"]*)"/.exec(attrs);
    let target: Target | null = null;
    if (dp && !cur) {
      target = {
        path: unescape(dp[1]),
        text: "",
        line: /\bclass="[^"]*\bkc-ln\b/.test(attrs),
        locked: /\sdata-locked="1"/.test(attrs),
        empty: /\sdata-empty="1"/.test(attrs),
        toggles: [],
        before: pendingToggles,
      };
      pendingToggles = [];
      out.push(target);
      cur = target;
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, target });
  }
  return out;
}

// ───────────────────────── 문단(unit)

export interface Unit {
  /** 배치 안 자리(덩이·칸·문단 번호, 강제 줄바꿈으로 나뉜 문단은 #조각) */
  id: string;
  para: Para;
  /** 문단 안 조각 번호(강제 줄바꿈 기준, 0부터) */
  seg: number;
  /** 조각 글(개체 제외) */
  text: string;
  /** 칸(같은 칸 문단끼리 같은 값) */
  cell: string;
}

export function paraText(p: Para): string {
  return p.items.map((i) => (i.kind === "text" ? i.text : i.kind === "tab" ? "\t" : i.kind === "br" ? "\n" : "")).join("");
}

/** 문단 조각(강제 줄바꿈으로 나눔): 조각마다 글. 줄바꿈은 늘 줄을 끝내므로 조각은 줄 단위로 나뉨.
 * 문단 머리(글머리표·번호 글, 한글이 그려 넣는 글)는 첫 조각 앞에 붙여 셈 — JSON(kordoc)은 번호 글을 본문에 적음 */
export function paraSegments(p: Para): string[] {
  const segs = paraText(p).split("\n");
  if (p.head) segs[0] = `${p.head} ${segs[0]}`;
  return segs;
}

/** 배치의 문단 조각들(문서 순서). 글보다 앞에 놓인 개체(글상자 등) 속 문단은 그 문단보다 먼저 */
export function unitsOf(layout: CardLayout): Unit[] {
  const out: Unit[] = [];
  const visitParas = (ps: Para[], at: string, cell: string) => ps.forEach((p, i) => visitPara(p, `${at}.p${i}`, cell));
  const visitObj = (o: Table | Shape | { kind: "pic" }, at: string) => {
    if (o.kind === "table") (o as Table).cells.forEach((c, ci) => visitParas(c.paras, `${at}.c${ci}`, `${at}.c${ci}`));
    else if (o.kind !== "pic") {
      const s = o as Shape;
      if (s.text) visitParas(s.text.paras, `${at}.t`, `${at}.t`);
      s.children.forEach((ch, k) => visitObj(ch, `${at}.s${k}`));
    }
  };
  function visitPara(p: Para, at: string, cell: string) {
    const firstText = p.items.find((i) => i.kind === "text" && i.text.trim())?.pos ?? Infinity;
    const objs = p.items.map((it, k) => ({ it, k })).filter((x) => x.it.kind === "obj");
    for (const { it, k } of objs) if (it.pos < firstText && it.kind === "obj") visitObj(it.obj, `${at}.o${k}`);
    const segs = paraSegments(p);
    segs.forEach((text, seg) => out.push({ id: segs.length > 1 ? `${at}#${seg}` : at, para: p, seg, text, cell }));
    for (const { it, k } of objs) if (it.pos >= firstText && it.kind === "obj") visitObj(it.obj, `${at}.o${k}`);
  }
  layout.blocks.forEach((b, bi) => {
    if (b.kind === "table") b.table.cells.forEach((c, ci) => visitParas(c.paras, `b${bi}.c${ci}`, `b${bi}.c${ci}`));
    else visitPara(b.para, `b${bi}.p0`, `b${bi}`);
  });
  return out;
}

// ───────────────────────── 글 맞춤 열쇠

const WS = /[\s\u00a0\u2007\u3000]/u;
/** 기호(글머리·체크 상자·사용자 영역 글자): 맞춤 열쇠에서 뺌 — 한글은 기호 글꼴의 사용자 영역 글자로, JSON은 유니코드 기호로 적는 일이 있음 */
export const isSym = (ch: string): boolean => {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000 || /[\p{So}\p{Sm}\p{No}\u2022\u00b7\u2027\uff65\u30fb]/u.test(ch);
};
export const isWs = (ch: string): boolean => WS.test(ch);

/** 맞춤 열쇠: 빈칸·기호를 빼고 체크 상자는 하나로 */
export function keyOf(s: string): string {
  let k = "";
  for (const ch of s) if (!isWs(ch) && !isSym(ch)) k += ch;
  return k;
}

/** 문단 열쇠 u의 앞부분 중 칸 열쇠 key의 끝과 같은 가장 긴 것(없으면 "") */
function lastPart(key: string, u: string): string {
  if (!u) return "";
  if (key.endsWith(u)) return u;
  const end = key[key.length - 1];
  for (let L = Math.min(u.length, key.length) - 1; L > 0; L--) if (u[L - 1] === end && key.endsWith(u.slice(0, L))) return u.slice(0, L);
  return "";
}

/** 한 칸 ↔ 문단 하나의 맞춤 점수(0이면 안 맞음). 기호만 있는 칸(→ 등)은 빈칸만 뺀 글로 비교 */
function sim(t: { key: string; empty: boolean; raw: string }, u: { key: string; raw: string }): number {
  if (!t.key) return t.raw ? (t.raw === u.raw ? 2 : 0) : !u.key && t.empty ? 0.2 : 0;
  if (!u.key) return 0;
  if (t.key === u.key) return 3;
  if (u.key.includes(t.key)) return 1.5 + (1.5 * t.key.length) / u.key.length;
  const d = dice(t.key, u.key);
  return d >= 0.5 ? d * 1.4 : 0;
}

// ───────────────────────── 잇기

/** 배치 문단에 적어 두는 잇기 표시 */
export interface Anchor {
  /** 그때의 경로 */
  path: string;
  /** line 글줄 하나 · cell 칸 글 전체 · part 여러 문단에 걸친 칸의 k째 조각 · sub 문단 글의 일부(앞뒤에 고정 글) */
  role: "line" | "cell" | "part" | "sub";
  /** part: 조각 번호 */
  part?: number;
  /** 글줄 목록의 한 줄(그때 기준) */
  line?: boolean;
  /** 그때 맞춘 방법(3 같음 · 그 밖 비슷함) */
  score: number;
  /** 화면·파일 쓰기 중: 번호를 바꾼 표시 · 앞 상자·붙임을 본떠 만든 표시 */
  remapped?: boolean;
  cloned?: boolean;
  /** 잇기 때 칸 글의 체크 상자들(☑□ 차례) — 원본이 기호 글꼴 글자로 그린 상자의 선택 상태가 그대로인지 알 때 씀 */
  boxes?: string;
}

export interface AnchorStats {
  targets: number;
  bound: number;
  exact: number;
  unbound: string[];
}

const MAX_PARTS = 10;

/**
 * 순서를 지키며 편집 칸과 문단을 맞춤(동적 계획법). 한 칸이 이어진 문단 여러 개(글상자·칸 여러 개)에 걸치면 조각으로 맞춤.
 * 결과는 문단 id → 잇기 표시.
 */
export function anchorUnits(targets: Target[], units: Unit[]): { anchors: Map<string, Anchor>; stats: AnchorStats } {
  const n = targets.length;
  const m = units.length;
  const rawOf = (s: string) => [...s].filter((ch) => !isWs(ch)).join("");
  const tk = targets.map((t) => ({ key: keyOf(t.text), empty: t.empty, raw: rawOf(t.text) }));
  const uk = units.map((u) => ({ key: keyOf(u.text), raw: rawOf(u.text) }));
  // dp[i][j]: 앞 i칸·앞 j문단의 최고 점수
  const W = m + 1;
  const dp = new Float64Array((n + 1) * W);
  const how = new Int16Array((n + 1) * W); // 0 칸 건너뜀 · -1 문단 건너뜀 · k>0 k문단 맞춤
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = dp[(i - 1) * W + j];
      let bh = 0;
      if (j > 0 && dp[i * W + j - 1] > best) {
        best = dp[i * W + j - 1];
        bh = -1;
      }
      if (j > 0) {
        const s1 = sim(tk[i - 1], uk[j - 1]);
        if (s1 > 0 && dp[(i - 1) * W + j - 1] + s1 > best) {
          best = dp[(i - 1) * W + j - 1] + s1;
          bh = 1;
        }
        // 여러 문단에 걸친 칸: 이어 붙인 열쇠가 칸 열쇠와 같음(뒤에서부터). 마지막 문단은 앞부분만 맞아도 됨(뒤에 고정 글 — 과제명 뒤 「과제번호」)
        const key = tk[i - 1].key;
        if (key) {
          let acc = lastPart(key, uk[j - 1].key);
          let parts = acc ? 1 : 0;
          for (let k = 2; k <= Math.min(MAX_PARTS, j); k++) {
            const u = uk[j - k].key;
            acc = u + acc;
            if (u) parts++;
            if (acc.length > key.length || !key.endsWith(acc)) break;
            if (parts > 1 && acc === key) {
              const s = 3 + 0.01 * parts;
              if (dp[(i - 1) * W + j - k] + s > best) {
                best = dp[(i - 1) * W + j - k] + s;
                bh = k;
              }
            }
          }
        }
      }
      dp[i * W + j] = best;
      how[i * W + j] = bh;
    }
  }
  const anchors = new Map<string, Anchor>();
  const stats: AnchorStats = { targets: n, bound: 0, exact: 0, unbound: [] };
  let i = n;
  let j = m;
  const bound = new Set<number>();
  while (i > 0) {
    const h = how[i * W + j];
    if (h === 0) {
      i--;
      continue;
    }
    if (h === -1) {
      j--;
      continue;
    }
    const t = targets[i - 1];
    if (h === 1) {
      const u = units[j - 1];
      const s = sim(tk[i - 1], uk[j - 1]);
      const role: Anchor["role"] = tk[i - 1].key && uk[j - 1].key !== tk[i - 1].key && uk[j - 1].key.includes(tk[i - 1].key) ? "sub" : t.line ? "line" : "cell";
      anchors.set(u.id, { path: t.path, role, score: s, line: t.line });
      if (s >= 3) stats.exact++;
    } else {
      for (let k = 0; k < h; k++) anchors.set(units[j - h + k].id, { path: t.path, role: "part", part: k, score: 3, line: t.line });
      stats.exact++;
    }
    bound.add(i - 1);
    stats.bound++;
    j -= h;
    i--;
  }
  // 순서가 다른 곳(글상자와 문단 글의 앞뒤, 표를 읽는 순서 차이): 안 맞은 칸마다 안 맞은 문단 중 열쇠가 같은 것(이어진 여러 문단도)을
  // 앞 칸이 맞은 자리에서 가장 가까운 것으로
  const used = new Set<number>();
  const firstUnit = new Map<number, number>();
  units.forEach((u, k) => {
    if (anchors.has(u.id)) used.add(k);
  });
  {
    const idx = new Map(units.map((u, k) => [u.id, k]));
    const byPath = new Map<string, number>();
    for (const [id, a] of anchors) if (!byPath.has(a.path) || (idx.get(id) ?? 0) < (byPath.get(a.path) ?? 0)) byPath.set(a.path, idx.get(id) ?? 0);
    targets.forEach((t, k) => {
      const at = byPath.get(t.path);
      if (at !== undefined) firstUnit.set(k, at);
    });
  }
  for (let k = 0; k < n; k++) {
    if (bound.has(k) || !tk[k].key) continue;
    const key = tk[k].key;
    let expect = 0;
    for (let q = k - 1; q >= 0; q--)
      if (firstUnit.has(q)) {
        expect = (firstUnit.get(q) as number) + 1;
        break;
      }
    let best: { at: number; len: number; d: number } | null = null;
    for (let a = 0; a < m; a++) {
      if (used.has(a) || !uk[a].key || !key.startsWith(uk[a].key)) continue;
      let acc = "";
      for (let b = a; b < Math.min(m, a + MAX_PARTS); b++) {
        if (used.has(b)) break;
        acc += uk[b].key;
        if (acc.length > key.length || !key.startsWith(acc)) break;
        if (acc === key) {
          const d = Math.abs(a - expect);
          if (!best || d < best.d) best = { at: a, len: b - a + 1, d };
          break;
        }
      }
    }
    if (!best) continue;
    const t = targets[k];
    if (best.len === 1) anchors.set(units[best.at].id, { path: t.path, role: t.line ? "line" : "cell", score: 3, line: t.line });
    else for (let q = 0; q < best.len; q++) anchors.set(units[best.at + q].id, { path: t.path, role: "part", part: q, score: 3, line: t.line });
    for (let q = 0; q < best.len; q++) used.add(best.at + q);
    firstUnit.set(k, best.at);
    bound.add(k);
    stats.bound++;
    stats.exact++;
  }
  targets.forEach((t, k) => {
    if (!bound.has(k) && keyOf(t.text)) stats.unbound.push(t.path);
  });
  return { anchors, stats };
}

/** 잇기 표시를 단 문단: 조각마다(강제 줄바꿈으로 나뉜 조각, 없으면 null). edge: 칸 글 앞뒤의 고정 글 수(과제명 뒤 「과제번호」 등) */
export type BoundPara = Para & { bind?: (Anchor | null)[]; edge?: [number, number] };

/** 문단 글 T 안에서 칸 글 S의 알맹이(빈칸·기호 뺀 글자)가 차지하는 범위 밖 글자 수 [앞, 뒤] */
export function edgesOf(T: string, S: string): [number, number] | null {
  const tc = [...T];
  const pos: number[] = [];
  let tkey = "";
  tc.forEach((ch, i) => {
    if (!isWs(ch) && !isSym(ch)) {
      pos.push(i);
      tkey += ch;
    }
  });
  const skey = keyOf(S);
  if (!skey) return null;
  const at = tkey.indexOf(skey);
  if (at < 0) return null;
  const t0 = pos[at];
  const t1 = pos[at + [...skey].length - 1] + 1;
  return [t0, tc.length - t1];
}

/** 배치에 잇기 표시를 적음(복사본). 적재·현행화 때 그때의 카드 JSON으로 한 번 */
export function anchorLayout(layout: CardLayout, card: LooseJson): { layout: CardLayout; stats: AnchorStats } {
  const copy = structuredClone(layout) as CardLayout;
  const units = unitsOf(copy);
  const targets = targetsOf(card);
  const { anchors, stats } = anchorUnits(targets, units);
  const textOf = new Map(targets.map((t) => [t.path, t.text]));
  for (const u of units) {
    const a = anchors.get(u.id);
    if (!a) continue;
    const p = u.para as BoundPara;
    p.bind ??= paraSegments(p).map(() => null);
    const boxes = [...(textOf.get(a.path) ?? "")].filter((ch) => /[☑□☐]/.test(ch)).join("");
    p.bind[u.seg] = boxes ? { ...a, boxes } : a;
  }
  // 한 칸 안 여러 문단에 걸친 칸 글(두 줄 과제명 등): 첫 문단 앞·끝 문단 뒤의 고정 글 수
  const multi = new Map<string, BoundPara[]>();
  for (const u of units) {
    const a = anchors.get(u.id);
    if (!a || a.role !== "part") continue;
    const list = multi.get(a.path) ?? [];
    if (!list.includes(u.para as BoundPara)) list.push(u.para as BoundPara);
    multi.set(a.path, list);
  }
  for (const [path, ps] of multi) {
    if (ps.length < 2) continue;
    const e = edgesOf(ps.map(paraText).join("\n"), textOf.get(path) ?? "");
    if (!e) continue;
    if (e[0]) ps[0].edge = [e[0], ps[0].edge?.[1] ?? 0];
    if (e[1]) ps[ps.length - 1].edge = [ps[ps.length - 1].edge?.[0] ?? 0, e[1]];
  }
  // 칸 글이 문단 글의 일부(앞뒤에 고정 글)인 문단: 고정 글 수를 적어 둠(글을 고쳐 흘려 그릴 때도 고정 글은 남김)
  for (const u of units) {
    const p = u.para as BoundPara;
    const paths = new Set((p.bind ?? []).filter(Boolean).map((a) => (a as Anchor).path));
    if (paths.size !== 1 || !(p.bind ?? []).some((a) => a && (a.role === "sub" || a.role === "part"))) continue;
    const e = edgesOf(paraText(p), textOf.get([...paths][0]) ?? "");
    if (e && (e[0] || e[1])) p.edge = e;
  }
  return { layout: copy, stats };
}
