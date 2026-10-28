// 글 보존 점검(결정론 — 2026-10-28): 화면 스냅숏의 보이는 글 줄 중 한글 파일 글에 없는 줄을 셉니다(카드 왕복·경평 표본 공용).
//  · 화면 글 줄: 스냅숏 글 마디의 줄 조각(frags — 추출기가 글자마다 잰 줄 자리)을 「담는 상자」(가장 가까운 inline·contents가 아닌 조상 —
//    inline-block 같은 원자 인라인도 담는 상자)마다 모아, 세로 가운데가 반 줄 안인 조각끼리 한 줄로 묶고 왼쪽부터 이음.
//    글 가운데 글이 든 안쪽 담는 상자(딱지 등)가 끼면 거기서 끊음 — 앞뒤 글은 따로 셈(한글에서는 딱지 글이 사이에 들어가므로). 글 없는 안쪽 상자(빈칸 자리)는 끊지 않음
//    의사요소 글(::before·::after — 「확인」 표지 등)은 줄에 넣지 않고 그 자리에서 끊음(변환기가 글로 넣든 글머리로 바꾸든 같은 판정 — 의사요소 생략은 근사 기록이 셈)
//  · 비교: 공백을 모두 지운 줄이 다시 읽은 한글의 어느 한 문단(표 칸 안 문단까지, 공백을 모두 지움)에 들어 있어야 함.
//    문단 경계를 넘어 이어 붙여 찾지 않음 — 화면 한 줄이 한글에서 두 문단으로 갈라지면 빠진 줄로 셈(엄격)
//  · 입출력 없는 순수 함수만 둡니다
import type { HwpDoc, Para } from "../../lib/hwp/model.ts";
import type { LayoutSnapshot, SnapBox, SnapNode } from "../../lib/reports/dom-hwpx/snapshot.ts";

/** 화면 글 줄 하나: 이은 글(공백 그대로)과 자리(mm, 본문 틀 기준) */
export interface ScreenLine {
  text: string;
  x: number;
  y: number;
}

/** 스냅숏 → 화면 글 줄(공백만인 줄은 뺌) */
export function screenLines(snap: LayoutSnapshot): ScreenLine[] {
  type Piece = { text: string; x: number; y: number; w: number; h: number };
  const groups: Piece[][] = [];
  /** 담는 상자마다 지금 모으는 조각 묶음 */
  const open = new Map<SnapBox, Piece[]>();
  let count = 0;
  const walk = (n: SnapNode, holder: SnapBox) => {
    if (n.kind === "text") {
      let list = open.get(holder);
      if (!list) {
        list = [];
        open.set(holder, list);
        groups.push(list);
      }
      n.frags.forEach((f, i) => {
        const end = i + 1 < n.frags.length ? n.frags[i + 1].at : n.text.length;
        list.push({ text: n.text.slice(f.at, end), x: f.x, y: f.y, w: f.w, h: f.h });
        count += 1;
      });
    } else if (n.kind === "box") {
      const d = n.style.display;
      const inner = d !== "inline" && d !== "contents";
      const at = inner ? n : holder;
      const before = count;
      if (n.before?.text.trim()) open.delete(at);
      for (const c of n.children) walk(c, at);
      if (n.after?.text.trim()) open.delete(at);
      // 글이 든 안쪽 담는 상자를 지나면 바깥 상자의 글 묶음을 끊음
      if (inner && count > before) open.delete(holder);
    }
  };
  walk(snap.root, snap.root);
  const out: ScreenLine[] = [];
  for (const pieces of groups) {
    const rows: Piece[][] = [];
    for (const p of [...pieces].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
      const cy = p.y + p.h / 2;
      const row = rows.find((r) => r.some((q) => Math.abs(q.y + q.h / 2 - cy) <= 0.5 * Math.min(p.h, q.h)));
      if (row) row.push(p);
      else rows.push([p]);
    }
    for (const r of rows) {
      r.sort((a, b) => a.x - b.x);
      const text = r.map((p) => p.text).join("");
      if (text.trim()) out.push({ text, x: r[0].x, y: Math.min(...r.map((p) => p.y)) });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 다시 읽은 한글 문서의 문단 글(표 칸 안 문단까지, 문단마다 하나) */
export function hwpParaTexts(doc: HwpDoc): string[] {
  const out: string[] = [];
  const list = (ps: readonly Para[]) => {
    for (const p of ps) {
      out.push(p.items.map((it) => (it.kind === "text" ? it.text : "")).join(""));
      for (const it of p.items) if (it.kind === "obj" && it.obj.kind === "table") for (const c of it.obj.cells) list(c.paras);
    }
  };
  for (const s of doc.sections) list(s.paras);
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** 화면 글 줄 중 한글 문단 어디에도(공백을 지우고) 들어 있지 않은 줄 */
export function missingLines(lines: readonly ScreenLine[], paras: readonly string[]): ScreenLine[] {
  const ps = paras.map(squash).filter(Boolean);
  return lines.filter((l) => {
    const t = squash(l.text);
    return !ps.some((p) => p.includes(t));
  });
}
