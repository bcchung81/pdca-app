// 경평 초안 spec → 개조식 마크다운(순수, 입출력 없음). 한글(HWPX) 내려받기의 입력 — lib/hwpx/generate.ts draftToKcaHwpx(md-profile 서브셋).
// 최소안(2026-10-16): 도식은 표·목록으로 펼치고 그림은 자리표시 줄로 둠 — 한글에서 다듬는 출발 원고이며 2025 판면 재현은 안 함.
// 묶는 규칙은 HTML 렌더러(section-html.ts)와 같은 함수를 씀: 라벨·단 띠·가로 반씩 = layoutGroups, 막대 없는 표 칸·2단 라벨 = ladderGroups,
// 전후 비교 패널 = isPanelCompare. 경영관리 마커 옮기기(지적개선을 카드 지적 행과 겹치는 절 대주제에)는 section-html.ts mgBody와 같은 짜임.

import { type Block, type BlockCell, FIGURE_LABEL, type Figure, blockTexts, isPanelCompare, ladderGroups } from "./blocks.ts";
import { layoutGroups } from "./layout.ts";
import type { Diagram, LadderRow, ReportSectionSpec } from "./section.ts";

const KNOWN_KINDS = new Set(["bullets", "cards", "compare", "steps", "timeline", "hub", "voices", "define", "band", "banner", "quotes", "case", "chart", "subhead", "stats", "qa", "table", "strategy", "pdca"]);

/** 글 한 줄: 줄바꿈 → 공백, 위첨자 ^{시점} → 시점 + 공백(한글 원고에는 위첨자가 없어 평문), 굵게 **…**·【확인: …】은 그대로 */
const t = (s: unknown) =>
  String(s ?? "")
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/\^\{([^{}]*)\}/g, "$1 ")
    .replace(/ {2,}/g, " ")
    .trim();
/** 굵게 표기를 걷은 글(상자·강조 안에서 표기가 겹치지 않게) */
const plain = (s: unknown) => t(s).replace(/\*\*/g, "");
/** 표 칸: 세로줄은 이스케이프 */
const cell = (s: unknown) => t(s).replace(/\|/g, "\\|");

const table = (rows: string[][]): string[] => {
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => cell(r[i] ?? "") || " ").join(" | ")} |`;
  return ["", line(rows[0]), `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line), ""];
};
/** 상자(```text — 안쪽 줄은 문법으로 읽지 않음, 굵게 표기는 글자로 남으므로 걷음) */
const box = (lines: string[]): string[] => (lines.length ? ["", "```text", ...lines.map(plain), "```", ""] : []);
const caption = (title: string) => (title ? ["", `[ ${t(title)} ]`] : []);
/** 같은 표기를 쓰는 다른 원고(지표 단위 카드 밖 부분 — unit-parts-md.ts)용 */
export { t as mdText, table as mdTable, caption as mdCaption };
const bullet = (s: string) => `ㅇ ${t(s)}`;
const sub = (s: string) => `- ${t(s)}`;
const figLine = (f: Figure) => `ㅇ [그림 자리 — ${FIGURE_LABEL[f.kind]}: ${t(f.desc)}]`;
const STEP_LEAD = /^(Step\s?\d+|\d단계)\s*/;

/** 칸 목록: 칸 머리(ㅇ 굵게) + 불릿(-) + 덧글(※). lead = 칸 머리 앞 글(단계 번호·표지) */
function cellLines(cells: BlockCell[], lead: (c: BlockCell, i: number) => string = (c) => (c.tag ? `[${t(c.tag)}] ` : "")): string[] {
  return cells.flatMap((c, i) => {
    const head = `${lead(c, i)}${t(c.head)}`.trim();
    return [...(head ? [`ㅇ **${head}**`] : []), ...c.bullets.map(sub), ...(c.note ? [`※ ${t(c.note)}`] : [])];
  });
}

/** 놓인 블록 하나의 줄(그림 자리표시 포함). warnings에 못 펼친 것을 더함 */
function blockLines(b: Block, warnings: string[]): string[] {
  const out = body(b, warnings);
  // 그림 자리표시는 블록 뒤에(위치 left/right/center는 한글에서 담당자가 정함)
  return [...out, ...(b.figures ?? []).map(figLine)];
}

function body(b: Block, warnings: string[]): string[] {
  const title = b.title ? [bullet(`**${t(b.title)}**`)] : [];
  switch (b.kind) {
    case "bullets":
      return [...title, ...b.items.map(bullet)];
    case "subhead":
      return [bullet(`**${t(b.text)}**`)];
    case "band":
      return [bullet(`${b.label ? `(${t(b.label)}) ` : ""}==▶ ${plain(b.text)} ◀==`)];
    case "banner":
      return [bullet(`==${plain(b.text)}==`)];
    case "cards":
      return [...title, ...cellLines(b.cells, (c) => (c.tag ? `[${t(c.tag)}] ` : ""))];
    case "pdca": {
      const DEF = ["P", "D", "C", "A"];
      return [...title, ...cellLines(b.cells.slice(0, 4), (c, i) => `[${t(c.tag || DEF[i]).slice(0, 2)}] `), ...(b.text ? [bullet(`↺ ${b.text}`)] : [])];
    }
    case "steps":
      // 단계 번호가 차례를 보이므로 칸 제목 앞 「Step N」·「N단계」는 뗌(렌더러와 같음)
      return [...title, ...cellLines(b.cells.map((c) => ({ ...c, head: c.head.replace(STEP_LEAD, ""), tag: c.tag.replace(/^(Step\s?\d+|\d단계)$/, "") })), (c, i) => `${i + 1}단계 ${c.tag ? `[${t(c.tag)}] ` : ""}`)];
    case "timeline":
      return [...title, ...cellLines(b.cells, () => "")];
    case "hub": {
      const [center, ...nodes] = b.cells;
      if (!center) return title;
      return [...title, ...cellLines([center], () => "[중심] "), ...nodes.flatMap((c) => cellLines([c], () => ""))];
    }
    case "voices":
      return [...title, ...box(b.cells.map((c) => `${t(c.head) || "현장"}: “${t(c.bullets[0])}”`))];
    case "quotes":
      return box(
        b.cells.flatMap((c, i) => [...(i ? [""] : []), [c.tag ? `[${t(c.tag)}]` : "", t(c.head)].filter(Boolean).join(" "), `“${t(c.bullets[0])}”${c.note ? ` (${t(c.note.replace(/^\(|\)$/g, ""))})` : ""}`]),
      );
    case "define":
      return [bullet(`**${t(b.title)}**`), ...(b.text ? [sub(b.text)] : []), ...(b.items.length ? [sub(b.items.map(t).join(" → "))] : [])];
    case "qa":
      return [...title, ...b.cells.flatMap((c) => [`ㅇ **Q. ${t(c.head)}**`, ...c.bullets.map((x, i) => sub(i ? x : `A. ${x}`))])];
    case "case":
      return [bullet(`**[${t(b.label) || "우수사례"}] ${t(b.title)}**`), ...b.items.map(sub)];
    case "chart":
      return [...caption(b.title), ...table([["구분", "값"], ...b.series.map((s) => [s.label, s.value])]), ...(b.badge ? [`※ ${t(b.badge)}`] : [])];
    case "stats": {
      const hasTag = b.cells.some((c) => c.tag);
      const hasDesc = b.cells.some((c) => c.bullets.length || c.note);
      return [...caption(b.title), ...table([[...(hasTag ? ["구분"] : []), "수치", ...(hasDesc ? ["설명"] : [])], ...b.cells.map((c) => [...(hasTag ? [c.tag] : []), c.head, ...(hasDesc ? [[...c.bullets, c.note].filter(Boolean).join(" / ")] : [])])])];
    }
    case "compare": {
      if (isPanelCompare(b)) {
        // 꼬리표·번호는 렌더러와 같게(기존 ➀➁➂ · 개선 ➊➋➌). 패널 제목(items)의 앞 꼬리표는 걷고 다시 붙임
        const diag = b.variant === "diag";
        const TAG = diag ? ["현황·문제", "추진방향"] : ["As-Is", "To-Be"];
        const LEAD_TAG = diag ? /^(현황\s*[·･ㆍ및]?\s*문제점?|추진\s?방향)\s*[:：-]?\s*/ : /^(As-?Is|To-?Be)\s*[:：-]?\s*/i;
        const NUM = ["➀➁➂➃➄", "➊➋➌➍➎"];
        const LEAD_NUM = /^\s*[①-⑳❶-❿➀-➓]\s*/;
        const head = [0, 1].map((to) => [TAG[to], t((b.items[to] ?? "").replace(LEAD_TAG, ""))].filter(Boolean).join(" — "));
        const side = (to: number) => b.rows.map((r, i) => `${[...NUM[to]][i] ?? ""} ${r.key ? `[${t(r.key)}] ` : ""}${t((to ? r.after : r.before).join(" / ").replace(LEAD_NUM, ""))}`.trim());
        const l = side(0);
        const r = side(1);
        return [...caption(b.title), ...table([head, ...l.map((x, i) => [x, r[i]])])];
      }
      return [...caption(b.title), ...table([["구분", "기존", "개선"], ...b.rows.map((r) => [r.key, r.before.join(" / "), r.after.join(" / ")])])];
    }
    case "table": {
      if (b.variant === "result") {
        // 오른쪽 「추진실적」 칸은 첫 행에 쓰고 아래 행은 〃(세로 병합)
        const result = [...b.series.map((s) => [s.value, s.label].filter(Boolean).join(" ")), b.text].filter(Boolean).join(" / ");
        const head = b.cells.some((c) => c.head);
        return [...caption(b.title), ...table([[...(head ? ["구분"] : []), "추진내용", "추진실적"], ...b.cells.map((c, i) => [...(head ? [c.head] : []), c.bullets.join(" / "), i ? "〃" : result])])];
      }
      if (b.variant === "ladder") {
        const subCol = b.cells.some((c) => c.tag);
        const rows: string[][] = [];
        for (const g of ladderGroups(b.cells)) {
          for (let i = g.start; i < g.start + g.rows; i++) rows.push([i === g.start ? g.head : "〃", ...(subCol ? [b.cells[i].tag] : []), b.cells[i].bullets.join(" / ")]);
        }
        return [...caption(b.title), ...table([["구분", ...(subCol ? ["세부"] : []), "내용"], ...rows])];
      }
      // 기본·막대·쉐브론: 머리 줄 = items, 행마다 head + 값 열(막대 길이·쉐브론 모양은 한글 원고에서 뺌)
      return [...caption(b.title), ...table([b.items, ...b.cells.map((c) => [c.head, ...c.bullets])])];
    }
    case "strategy": {
      // 층 이름(items)은 렌더러처럼 위에서부터 차례로: 목표 띠(text) → 열 머리 → 과제 → 지표(덧글이 있을 때)
      let r = 0;
      const layer = (fallback: string) => t(b.items[r++]) || fallback;
      const top = b.text ? [bullet(`**${layer("목표")}** ${t(b.text)}`)] : [];
      const rows = [[layer("구분"), ...b.cells.map((c) => [c.tag ? `[${c.tag}]` : "", c.head].filter(Boolean).join(" "))], [layer("내용"), ...b.cells.map((c) => c.bullets.join(" / "))]];
      if (b.cells.some((c) => c.note)) rows.push([layer("비고"), ...b.cells.map((c) => c.note)]);
      return [...title, ...top, ...table(rows)];
    }
    default:
      return unknownBlock(b as Block, warnings);
  }
}

/** 모르는 블록 종류: 글을 잃지 않게 있는 글을 모두 ㅇ 줄로 */
function unknownBlock(b: Block, warnings: string[]): string[] {
  const kind = String((b as { kind?: unknown }).kind);
  if (!KNOWN_KINDS.has(kind)) warnings.push(`모르는 블록 종류 「${kind}」 — 글만 ㅇ 줄로 옮겼습니다.`);
  return blockTexts(b).map(bullet);
}

/** 블록 목록 → 줄: 라벨 사다리·단 띠는 □ 라벨 아래에 묶고, 라벨 없는(전폭) 블록은 그대로(layoutGroups — 렌더러·판면 어림과 같은 묶음) */
function blocksLines(blocks: Block[], warnings: string[]): string[] {
  const out: string[] = [];
  for (const g of layoutGroups(blocks)) {
    if (g.type !== "full") out.push(`□ ${t(g.label)}`);
    for (const j of g.units.flat()) out.push(...blockLines(blocks[j], warnings));
  }
  return out;
}

/** 옛 도식(v1·v2 행)을 블록으로 바꿔 같은 펼침을 씀 */
function diagramBlock(d: Diagram): Block | null {
  const base = { label: "", title: d.title, variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "" };
  const steps = d.steps.map((s) => ({ head: s.title, tag: "", bullets: s.bullets, note: s.note }));
  switch (d.type) {
    case "before_after":
      return { ...base, kind: "compare", variant: "table", rows: d.rows };
    case "process_flow":
      return { ...base, kind: "steps", cells: steps };
    case "timeline":
      return { ...base, kind: "timeline", cells: steps };
    case "card_grid":
      return { ...base, kind: "cards", cells: steps.slice(0, 4) };
    case "action_table":
      return { ...base, kind: "table", items: ["추진 노력", "추진 성과"], cells: d.actions.map((a) => ({ head: "", tag: "", bullets: [a.effort, a.result], note: "" })) };
    default:
      return null;
  }
}

function rowLines(r: LadderRow, warnings: string[]): string[] {
  const d = diagramBlock(r.diagram);
  return [
    `□ ${t(r.label)}`,
    ...r.bullets.map(bullet),
    ...(d ? blockLines(d, warnings) : []),
    ...(r.chart ? body({ kind: "chart", label: "", title: r.chart.title, variant: "", text: "", items: [], cells: [], rows: [], series: r.chart.series, badge: r.chart.badge }, warnings) : []),
  ];
}

/** 추진성과(□ 추진성과): 3칸 → 표, 불릿 → ㅇ, 막대 → 수치 표, 강조 띠 → 강조 줄 */
function resultLines(spec: ReportSectionSpec): string[] {
  const cards = spec.resultCards ?? [];
  const chart = spec.resultChart && spec.resultChart.series.length >= 2 ? spec.resultChart : null;
  if (!cards.length && !spec.results.length && !chart && !spec.resultBand) return [];
  const hasTag = cards.some((c) => c.tag);
  return [
    "□ 추진성과",
    ...(cards.length ? table([[...(hasTag ? ["구분"] : []), "성과", "수치"], ...cards.map((c) => [...(hasTag ? [c.tag] : []), c.headline, c.figure])]) : []),
    ...spec.results.map(bullet),
    ...(chart ? body({ kind: "chart", label: "", title: chart.title, variant: "", text: "", items: [], cells: [], rows: [], series: chart.series, badge: chart.badge }, []) : []),
    ...(spec.resultBand ? [bullet(`==${plain(spec.resultBand)}==`)] : []),
  ];
}

const hdr = (a: string, b: string) => [a, b];
const MARKER_LABEL = (ms: string[]) => ms.map((m) => ` [${m}]`).join("");

/** 경영관리: 평가내용 → 대주제 → 절 머리를 블록 앞에 끼움(section-html.ts mgBody와 같은 자리·같은 글자 — 마커 옮기기 포함) */
function mgLines(spec: ReportSectionSpec, blocks: Block[], mg: NonNullable<ReportSectionSpec["mg"]>, warnings: string[], cont?: MgCont): string[] {
  const out: string[] = [];
  let ev = -1;
  let th = "";
  const order = [...(spec.task.bp ? ["BP"] : []), ...spec.sub.markers];
  const findThemes = new Set(mg.parts.filter((p) => mg.finding?.includes(p.key)).map((p) => `${p.evalNo}.${p.themeNo}`));
  const moved = findThemes.size > 0 && order.includes("지적개선");
  const pend = new Set(order.filter((m) => !(moved && m === "지적개선")));
  const done = new Set<string>();
  const enter = (k: string) => {
    if (moved && findThemes.has(k) && !done.has(k)) {
      pend.add("지적개선");
      done.add(k);
    }
  };
  const take = () => {
    const ms = order.filter((m) => pend.has(m));
    pend.clear();
    return MARKER_LABEL(ms);
  };
  // 지표 한 파일에서 앞 과제에 이어질 때: 첫 절의 평가내용 머리·대주제 머리를 이미 쓴 것으로 둠(section-html.ts mgBody의 mgCont와 같은 규칙 — 마커는 다음에 쓰는 머리에)
  const p0 = mg.parts[0];
  if (p0 && cont?.eval) ev = p0.evalNo;
  if (p0 && cont?.eval && cont.theme) {
    th = `${p0.evalNo}.${p0.themeNo}`;
    enter(th);
  }
  const used = new Set<number>();
  for (const p of mg.parts) {
    const rows: string[][] = [];
    if (p.evalNo !== ev) {
      ev = p.evalNo;
      th = "";
      rows.push(hdr(`평가내용${p.evalNo}`, t(p.evalTitle)));
    }
    const k = `${p.evalNo}.${p.themeNo}`;
    if (k !== th) {
      th = k;
      enter(k);
      rows.push(hdr(`대주제 ${p.themeNo}`, `${t(p.themeTitle)}${take()}`));
    }
    if (p.mark) rows.push(hdr(`${p.mark}.`, `${p.chip ? `[${t(p.chip)}] ` : ""}${t(p.title)}${take()}`));
    if (rows.length) out.push("", ...table(rows));
    const idx = mg.at.flatMap((key, i) => (key === p.key ? [i] : []));
    if (!idx.length) continue;
    idx.forEach((i) => used.add(i));
    out.push(...blocksLines(blocks.slice(idx[0], idx.at(-1)! + 1), warnings));
  }
  // 어느 절에도 안 놓인 블록(절 열쇠가 골격에 없음)도 글을 잃지 않게 끝에
  const orphan = blocks.map((_, i) => i).filter((i) => !used.has(i));
  if (orphan.length) {
    warnings.push(`절 열쇠가 골격에 없는 블록 ${orphan.length}개를 끝에 모았습니다.`);
    out.push(...blocksLines(orphan.map((i) => blocks[i]), warnings));
  }
  return out;
}

/** 경영관리: 앞 과제의 마지막 절과 같은 평가내용·대주제라 머리를 다시 쓰지 않음(business-layout.ts mgContinuations) */
export type MgCont = { eval: boolean; theme: boolean };

/**
 * 소항목 spec → 개조식 마크다운. 첫 줄은 제목, 머리(대상사업·실행과제·소항목 또는 평가내용·대주제·절)는 2열 표, 본문은 □ 라벨 / ㅇ / - / 표 / 상자.
 * opts.mgCont(경영관리, 지표 한 파일에서 앞 과제에 이어질 때)가 있으면 첫 절의 평가내용·대주제 머리를 생략 — 없으면 예전과 같은 출력
 */
export function sectionMarkdown(spec: ReportSectionSpec, opts: { mgCont?: MgCont } = {}): { md: string; warnings: string[] } {
  const warnings: string[] = [];
  const out: string[] = [t(`${spec.card.taskNo} ${spec.card.title} 초안`), ""];
  if (spec.version === 3 && spec.blocks && spec.mg) {
    out.push(...mgLines(spec, spec.blocks, spec.mg, warnings, opts.mgCont));
  } else {
    out.push(
      ...table([
        [`대상사업${spec.business.no}`, t(spec.business.name)],
        [`실행과제 ${t(spec.task.no)}`, `${t(spec.task.title)}${spec.task.bp ? " [BP]" : ""}`],
        [`${t(spec.sub.mark)}.`, `${spec.sub.chip ? `[${t(spec.sub.chip)}] ` : ""}${t(spec.sub.title)}${MARKER_LABEL(spec.sub.markers)}`],
      ]),
    );
    if (spec.version === 3 && spec.blocks) out.push(...blocksLines(spec.blocks, warnings));
    else {
      // v1·v2: 인용 상자 → 추진배경 행 → 메시지 띠 → 나머지 행 → 우수사례(렌더러 순서)
      for (const c of spec.context ?? []) out.push(...body({ kind: "quotes", label: "", title: "", variant: "", text: "", items: [], cells: [{ head: c.title, tag: c.chip, bullets: [c.quote], note: c.cite }], rows: [], series: [], badge: "" }, warnings));
      const span = spec.banner ? Math.max(0, spec.rows.findIndex((r) => r.label === "추진배경") + 1) : spec.rows.length;
      spec.rows.slice(0, span).forEach((r) => out.push(...rowLines(r, warnings)));
      if (spec.banner) out.push(bullet(`==${plain(spec.banner)}==`));
      spec.rows.slice(span).forEach((r) => out.push(...rowLines(r, warnings)));
      for (const c of spec.cases ?? []) out.push(bullet(`**[${t(c.tab) || "우수사례"}] ${t(c.title)}**`), ...c.items.map(sub));
    }
  }
  out.push(...resultLines(spec));
  return { md: `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`, warnings };
}
