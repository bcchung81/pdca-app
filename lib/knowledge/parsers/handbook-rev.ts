// 2026년도 경영평가편람 수정 신구대비표('26.11.13) → 바뀐 지표·구성요소의 「수정」 쪽 글 = 조각(편람 조각과 같은 handbook_indicator).
// 원문은 두 열 표 「2026년도 경영평가편람(기존) | (수정)」. 표마다 머리 행의 「(수정)」 칸이 시작하는 격자 열부터 오른쪽만 읽고(기존 쪽은 버림), 칸 글은 원문 그대로 둠.
// 읽는 범위(사용자 결정 2026-11-19): 「제3절 평가지표별 세부평가내용」 ~ 「제3장 경영실적 평가방법」 앞(3~9쪽, 경영관리)과 「총괄요약표(주요사업)」부터 끝(18~22쪽, KCA 주요사업).
// 넣지 않는 것: 1~2쪽(평가 주체 이름·이의제기·평가유형)·10~11쪽(공기업 재무지표·외부평가·후속조치) — KCA 영향 없음, 12~17쪽 기관장 편람 — 기관장평가 트랙을 만들 때 따로.
// 신구대비표는 바뀐 칸만 적고 「⋮」로 줄이므로, 조각마다 meta.supersedes(같은 자리의 '26 편람 최초 조각 key)를 적어 요청 때 「나머지는 편람 조각 그대로」 표지를 붙임(revision-note.ts).
// 조각 key는 옛 편람 조각과 같은 꼴(`<doc>/handbook26/<단위>/…`)이라 편람 조각을 key로 찾는 곳(`%/handbook26/<단위>/%`)에 같이 걸림.

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { businessLabel, businessShort, resolveBusiness } from "../dictionaries.ts";
import { cellText, compactKey } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { type ParsedTable, type TableCell, parseHtmlTables } from "../table.ts";
import { pickQuasiGovPoints } from "./plan-mg-eval.ts";
import type { BusinessId, Check, KnowledgeChunk, ParseResult } from "../types.ts";

export const HANDBOOK_REV_DOC_ID = "hb26r-2611";
/** 판 표지(meta.revision) — revision-note.ts가 이 값으로 「수정본 조각」을 알아봄 */
export const HANDBOOK_REV_EDITION = "2026.11.13";
const PREFIX = "'26 편람(11.13 수정)";
const OLD = "plan-2607/handbook26";

/** 경영관리 바뀐 구성요소(원문 순서) — 옛 편람 조각(plan-2607 붙임2)의 자리. 원문 표의 평가지표 칸·적용대상으로 맞는지 검산함 */
export const MG_REV_COMPONENTS = [
  { unit: "MG-3", category: "안전 및 책임경영", no: 1, name: "일자리 및 균등한 기회", comp: [1, 2], measure: "계량", old: "MG-3/k1", kinds: { 1: "그대로", 2: "수정" } },
  { unit: "MG-3", category: "안전 및 책임경영", no: 1, name: "일자리 및 균등한 기회", comp: [2, 2], measure: "비계량", old: "MG-3/k2", kinds: { 1: "수정", 2: "그대로", 6: "신설" } },
  { unit: "MG-4", category: "안전 및 책임경영", no: 2, name: "안전 및 재난관리", comp: [1, 4], measure: "계량", old: "MG-4/k1", definition: "산업재해", kinds: { 1: "수정" } },
  { unit: "MG-4", category: "안전 및 책임경영", no: 2, name: "안전 및 재난관리", comp: [2, 4], measure: "비계량", old: "MG-4/k2", definition: "산업재해", kinds: { 1: "수정" } },
  { unit: "MG-4", category: "안전 및 책임경영", no: 2, name: "안전 및 재난관리", comp: [3, 4], measure: "비계량", old: "MG-4/k3", definition: "재난으로부터", kinds: { 1: "수정" } },
  { unit: "MG-6", category: "안전 및 책임경영", no: 4, name: "창업 및 경제활성화", comp: [1, 1], measure: "비계량", old: "MG-6/k1", kinds: { 1: "그대로", 6: "신설" } },
  // ③은 옛 ②(기부·봉사)를 지역인재 양성으로 재편, ④는 옛 ③(시설·장비 개방) 그대로 — from = 옛 번호
  { unit: "MG-7", category: "안전 및 책임경영", no: 5, name: "상생·협력 및 지역발전", comp: [2, 2], measure: "비계량", old: "MG-7/k2", kinds: { 1: "그대로", 2: "신설", 3: "수정", 4: "그대로" }, from: { 3: 2, 4: 3 } },
  // 혁신가점 ③(국정과제 핵심정책 이행) — 원문 평가지표 칸은 「공공기관 혁신 가점」(가점 ①②는 바뀌지 않음). ③ 아래 「-」 항목(순서 번호)의 구분은 subKinds
  { unit: "MG-14", category: "공공기관 혁신 노력과 성과 가점", no: null, name: "국정과제 핵심정책 이행", table: "공공기관 혁신 가점", comp: [3, 3], measure: "가점", old: "MG-14/k1", kinds: { 3: "수정" }, subKinds: { 1: "그대로", 2: "그대로", 3: "수정", 4: "그대로", 5: "신설" } },
] as const;

/** 검산 기대값 — 원문(22쪽)을 직접 세어 확인한 값. 새 판이 오면 원문으로 먼저 확인할 것 */
export const HANDBOOK_REV_EXPECTED = {
  /** 경영관리 구성요소 8 + 주요사업2(구성 1·지표 3) + 주요사업3(구성 1·지표 2) */
  chunks: 15,
  perUnit: { "MG-3": 2, "MG-4": 3, "MG-6": 1, "MG-7": 1, "MG-14": 1, "BZ-2": 4, "BZ-3": 3 } as Record<string, number>,
  /** 총괄요약표 「수정」 쪽 배점(사업 합계·지표 가중치) */
  points: { "BZ-2": 18, "BZ-3": 16 } as Record<string, number>,
  weights: { "BZ-2": [4, 2, 2, 3, 7], "BZ-3": [3, 2, 4, 7] } as Record<string, number[]>,
  /** 「(신 설)」 행이 기존 쪽에 있는 지표(수정본에서 새로 생김) */
  newMetrics: ["BZ-2/m2", "BZ-2/m3", "BZ-3/m2"],
  pages: { mg: [3, 9], biz: [18, 22] } as Record<string, [number, number]>,
};

const LABELS: Record<string, string> = {
  지표정의: "지표정의",
  적용대상배점: "적용대상(배점)",
  세부평가내용: "세부평가내용",
  정의: "정의",
  기준치: "기준치",
  목표: "목표",
  측정산식및변수: "측정 산식 및 변수",
};
/** 「(1) 지표명 (평가방식 : …, 가중치 : N점)」(평가방식이 없는 지표도 있음) */
const METRIC_HEAD = /^\((\d+)\)\s*(.+?)\s*\((?:평가방식\s*:\s*(.+?),\s*)?가중치\s*:\s*([\d.]+)\s*점\)$/;
const BUSINESS_HEAD = /^#?\s*(.+?)\s*\[(\d+)점\]$/;

const cell = (c: TableCell) => cellText(c.html, "\n");

/** 표 머리 행에서 「(수정」이 든 칸이 시작하는 격자 열 */
function revisedFromCol(t: ParsedTable): number | null {
  let col = 0;
  for (const c of t.rows[0]?.cells ?? []) {
    if (/\(수정/.test(c.text)) return col;
    col += c.colspan;
  }
  return null;
}

/** 행마다 그 행에서 시작하는 「수정」 쪽 칸(병합으로 위 행에서 내려온 칸은 뺌). 머리 행 제외 */
function revisedRows(t: ParsedTable): TableCell[][] | null {
  const from = revisedFromCol(t);
  if (from === null) return null;
  let busy: number[] = []; // 열마다 위 행의 병합 칸이 이 행부터 더 차지하는 행 수
  const out: TableCell[][] = [];
  for (const row of t.rows) {
    const next = busy.map((n) => Math.max(0, n - 1));
    const mine: TableCell[] = [];
    let col = 0;
    for (const c of row.cells) {
      while ((busy[col] ?? 0) > 0) col += 1;
      if (col >= from) mine.push(c);
      for (let k = 0; k < c.colspan; k++) next[col + k] = c.rowspan - 1;
      col += c.colspan;
    }
    busy = Array.from(next, (n) => n ?? 0);
    out.push(mine);
  }
  return out.slice(1);
}

interface Field {
  label: string;
  lines: string[];
}
interface Component {
  names: string[];
  fields: Field[];
  page: number;
  pageEnd: number;
}
interface Metric {
  business: BusinessId;
  no: number;
  name: string;
  method: string | null;
  weight: number;
  fields: Field[];
  /** 기존 쪽 칸이 「(신 설)」 */
  isNew: boolean;
  page: number;
  pageEnd: number;
}
interface SummaryRow {
  business: BusinessId | null;
  name: string;
  nonQuant: string;
  quant: string;
  total: string;
}

const fieldText = (f: Field) => `${f.label}: ${f.lines.join("\n")}`;
const fieldOf = (fields: Field[], label: string) => fields.find((f) => f.label === label)?.lines.join("\n") ?? "";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const ELIDED = "⋮";

/** 세부평가내용의 동그라미 번호(①~⑳·➀~➉) — 글 순서 */
function itemNumbers(criteria: string): number[] {
  return criteria.split("\n").flatMap((l) => {
    const m = /^\s*([①-⑳➀-➉])/.exec(l);
    if (!m) return [];
    const c = m[1].codePointAt(0)!;
    return [c >= 0x2460 && c <= 0x2473 ? c - 0x245f : c - 0x277f];
  });
}
/** 세부평가내용의 「-」 항목 머리(줄바꿈으로 끊긴 머리는 「*」·「-」·「※」 줄 전까지 이음) — 혁신가점 ③ 아래 항목 */
function dashItems(criteria: string): string[] {
  const out: string[] = [];
  let open = false;
  for (const l of criteria.split("\n").map((x) => x.trim())) {
    if (/^-\s*/.test(l)) {
      out.push(l.replace(/^-\s*/, ""));
      open = true;
    } else if (/^[*※①-⑳➀-➉⋮]/.test(l)) open = false;
    else if (open && out.length) out[out.length - 1] += ` ${l}`;
  }
  return out;
}

export function parseHandbookRev(blocks: SourceBlock[], docId = HANDBOOK_REV_DOC_ID): ParseResult {
  const checks: Check[] = [];
  const components: Component[] = [];
  const metrics: Metric[] = [];
  const summary: SummaryRow[] = [];
  const unchanged: Array<{ business: BusinessId; line: string }> = [];
  const points: Partial<Record<BusinessId, number>> = {};
  let section: "mg" | "biz" | null = null;
  let business: BusinessId | null = null;
  let current: { fields: Field[]; pageEnd: number } | null = null;
  let stray = 0; // 붙일 곳 없는 「수정」 쪽 글 칸

  const addValue = (label: string | null, value: string, page: number) => {
    if (!current) {
      stray += 1;
      return;
    }
    current.pageEnd = page;
    if (label) current.fields.push({ label, lines: [value] });
    else if (current.fields.length) current.fields[current.fields.length - 1].lines.push(value);
    else stray += 1;
  };

  for (const b of blocks) {
    const text = b.text.trim();
    if (b.type === "heading" || /^#\s/.test(text)) {
      const h = text.replace(/^#+\s*/, "");
      if (/평가지표별\s*세부평가내용/.test(h)) section = "mg";
      else if (/경영실적\s*평가방법|기관장\s*경영계약/.test(h)) section = null;
      else if (/총괄요약표/.test(h)) section = "biz";
      else if (section === "biz") {
        const m = BUSINESS_HEAD.exec(h);
        const id = m ? resolveBusiness(m[1]) : null;
        if (m && id) {
          business = id;
          points[id] = Number(m[2]);
          current = null;
        }
      }
      continue;
    }
    if (!section || !text.startsWith("<table")) continue;
    for (const t of parseHtmlTables(text)) {
      const rows = revisedRows(t);
      if (!rows) continue;
      // 총괄요약표: 「지표명 | 비계량 | 계량 | 합계」(빈 칸도 자리)
      if (section === "biz" && rows[0]?.map(cell).join("|") === "지표명|비계량|계량|합계") {
        let biz: BusinessId | null = null;
        for (const r of rows.slice(1)) {
          const [name, nonQuant, quant, total] = r.map(cell);
          if (!name) continue;
          const head = /^\d+\.\s*(.+)$/.exec(name);
          if (head) biz = resolveBusiness(head[1]);
          else if (/합계/.test(name)) biz = null;
          summary.push({ business: head ? biz : /합계/.test(name) ? null : biz, name, nonQuant: nonQuant ?? "", quant: quant ?? "", total: total ?? "" });
        }
        continue;
      }
      rows.forEach((r, i) => {
        const cells = r.map(cell).filter(Boolean);
        if (!cells.length) return;
        const labelAt = cells.findIndex((c) => LABELS[compactKey(c)] !== undefined);
        if (compactKey(cells[0]) === "평가지표") return; // 열 이름 행
        if (section === "biz" && labelAt < 0) {
          const lines = cells.join("\n").split("\n");
          const heads = lines.map((l) => METRIC_HEAD.exec(l.trim()));
          if (heads.every(Boolean)) {
            if (!business) throw new Error("편람 수정 신구대비표: 사업 제목보다 지표 머리가 먼저 나왔습니다");
            // 여러 줄 머리 = 바뀌지 않은 지표의 번호·평가방식·가중치 목록(표 끝 행)
            if (heads.length > 1) {
              for (const l of lines) unchanged.push({ business, line: l.trim() });
              current = null;
              return;
            }
            const m = heads[0]!;
            // 같은 행 기존 쪽이 「(신 설)」이면 새로 생긴 지표(원문 표의 기존 쪽 칸 — 행 전체 글로 봄)
            const isNew = /\(신\s*설\)/.test(t.rows[i + 1]?.cells.map((c) => c.text).join(" ") ?? "");
            const metric: Metric = { business, no: Number(m[1]), name: m[2].trim(), method: m[3]?.trim() ?? null, weight: Number(m[4]), fields: [], isNew, page: b.page, pageEnd: b.page };
            metrics.push(metric);
            current = metric;
            return;
          }
        }
        if (labelAt >= 0) {
          const label = LABELS[compactKey(cells[labelAt])];
          if (section === "mg" && label === "지표정의") {
            const comp: Component = { names: [], fields: [], page: b.page, pageEnd: b.page };
            components.push(comp);
            current = comp;
          }
          if (section === "mg" && current && labelAt > 0) (current as Component).names?.push(...cells.slice(0, labelAt));
          addValue(label, cells.slice(labelAt + 1).join("\n"), b.page);
        } else {
          // 값만 있는 행 = 앞 칸(같은 머리)의 이어지는 글(쪽 넘김 표)
          if (section === "mg" && current && cells.length > 1) (current as Component).names?.push(...cells.slice(0, -1));
          addValue(null, cells[cells.length - 1], b.page);
        }
      });
    }
  }

  const chunks: KnowledgeChunk[] = [];
  const counts: Record<string, number> = {};
  const count = (u: string) => (counts[u] = (counts[u] ?? 0) + 1);
  const meta = (supersedes: string[], extra: Record<string, unknown>) => ({ edition: `2026년도 경영평가편람 수정(신구대비표 ${HANDBOOK_REV_EDITION})`, revision: HANDBOOK_REV_EDITION, supersedes, elided: false, ...extra, page_basis: "pdf-start" });

  // 경영관리: 구성요소 = 원문 순서대로 MG_REV_COMPONENTS
  const mismatch: string[] = [];
  components.forEach((c, i) => {
    const spec = MG_REV_COMPONENTS[i];
    if (!spec) {
      mismatch.push(`예상보다 많은 구성요소: ${oneLine(c.names.join(" "))}`);
      return;
    }
    const tableName = "table" in spec ? spec.table : spec.name;
    const appliesTo = oneLine(fieldOf(c.fields, "적용대상(배점)"));
    const definition = fieldOf(c.fields, "지표정의");
    const criteria = fieldOf(c.fields, "세부평가내용");
    if (compactKey(c.names.join("")) !== compactKey(tableName)) mismatch.push(`${spec.old}: 평가지표 칸 「${oneLine(c.names.join(" "))}」 ≠ 「${tableName}」`);
    if (spec.measure !== "가점" && !appliesTo.includes(spec.measure)) mismatch.push(`${spec.old}: 적용대상에 「${spec.measure}」 없음`);
    if ("definition" in spec && !definition.includes(spec.definition)) mismatch.push(`${spec.old}: 지표정의에 「${spec.definition}」 없음`);
    if (!definition || !appliesTo || !criteria) mismatch.push(`${spec.old}: 지표정의·적용대상·세부평가내용 중 빈 칸`);
    const [compNo, compCount] = spec.comp;
    const pick = spec.measure === "가점" ? null : pickQuasiGovPoints(appliesTo);
    const bonus = spec.measure === "가점" ? Number(/\(([\d.]+)\s*점\)/.exec(criteria)?.[1] ?? NaN) : NaN;
    const weight = pick?.points ?? (Number.isFinite(bonus) ? bonus : null);
    const items = itemNumbers(criteria);
    const kinds = spec.kinds as Record<number, string>;
    if (JSON.stringify(items) !== JSON.stringify(Object.keys(kinds).map(Number))) mismatch.push(`${spec.old}: 세부평가내용 번호 ${JSON.stringify(items)} ≠ 구분표 ${JSON.stringify(Object.keys(kinds))}`);
    const subKinds = "subKinds" in spec ? (spec.subKinds as Record<number, string>) : null;
    const dashes = subKinds ? dashItems(criteria) : [];
    if (subKinds && dashes.length !== Object.keys(subKinds).length) mismatch.push(`${spec.old}: 「-」 항목 ${dashes.length}개 ≠ 구분표 ${Object.keys(subKinds).length}개`);
    const where = spec.no === null ? `${spec.category} · ${spec.name}` : `경영관리 범주 · ${spec.category} · (${spec.no}) ${spec.name}${compCount > 1 ? ` · 구성요소 ${compNo}/${compCount}` : ""}`;
    const tail = spec.measure === "가점" ? `가점 ${weight}점` : `${spec.measure}${compCount > 1 ? ` (${compNo}/${compCount})` : ""}`;
    count(spec.unit);
    chunks.push(
      makeChunk({
        chunk_key: `${docId}/handbook26/${spec.unit}/${spec.old.split("/")[1]}`,
        doc_id: docId,
        unit_type: "handbook_indicator",
        track: "경영관리",
        business: spec.unit,
        eval_item: null,
        measure: spec.measure,
        q_type: ["편람"],
        title: `${PREFIX} · ${spec.name} · ${tail}`,
        context_prefix: `${PREFIX} · ${where} · 적용대상 ${appliesTo}`,
        blocks: c.fields.map(fieldText),
        pdf_page_start: c.page,
        pdf_page_end: c.pageEnd,
        meta: meta([`${OLD}/${spec.old}`], {
          elided: c.fields.some((f) => f.lines.join("\n").includes(ELIDED)),
          category: spec.category,
          ...(spec.no === null ? {} : { indicator_no: spec.no }),
          indicator_label: spec.name,
          component_no: compNo,
          component_count: compCount,
          applies_to: appliesTo,
          weight_quasi_gov: weight,
          weight_basis: spec.measure === "가점" ? "공공기관 혁신가점(준정부기관 5점 중)" : (pick?.by ?? null),
          // 이 조각 글이 다루는 세부평가내용 번호(글 순서)와 구분(수정·신설·그대로) — 신구대비표 기존·수정 쪽을 대조해 확인한 표(MG_REV_COMPONENTS.kinds), 글의 번호와 다르면 검산 실패
          items,
          item_kinds: Object.fromEntries(items.map((n) => [String(n), kinds[n]])),
          ...("from" in spec ? { item_from: Object.fromEntries(Object.entries(spec.from).map(([k, v]) => [k, v])) } : {}),
          ...(subKinds ? { sub_items: dashes.map((head, i) => ({ no: i + 1, kind: subKinds[i + 1], head: oneLine(head) })) } : {}),
        }),
      }),
    );
  });
  if (components.length < MG_REV_COMPONENTS.length) mismatch.push(`구성요소가 모자람(${components.length}/${MG_REV_COMPONENTS.length})`);

  // 주요사업: 사업마다 지표 구성 조각 + 바뀐·새 지표 조각
  for (const biz of ["BZ-2", "BZ-3"] as const) {
    const rows = summary.filter((r) => r.business === biz);
    const own = metrics.filter((m) => m.business === biz);
    const total = points[biz] ?? null;
    const pts = (r: SummaryRow) => [r.nonQuant && `비계량 ${r.nonQuant}`, r.quant && `계량 ${r.quant}`, r.total && `합계 ${r.total}`].filter(Boolean).join(", ");
    const pages = [...own.map((m) => m.page), ...own.map((m) => m.pageEnd)];
    count(biz);
    chunks.push(
      makeChunk({
        chunk_key: `${docId}/handbook26/${biz}`,
        doc_id: docId,
        unit_type: "handbook_indicator",
        track: "주요사업",
        business: biz,
        eval_item: null,
        measure: null,
        q_type: ["편람"],
        title: `${PREFIX} · ${businessShort(biz)} 지표 구성`,
        context_prefix: `${PREFIX} · ${businessLabel(biz)}${total ? ` [${total}점]` : ""}`,
        blocks: [
          ...rows.map((r) => `${r.name} — ${pts(r)}`),
          ...own.map((m) => `(${m.no}) ${m.name} (${m.method ? `평가방식 : ${m.method}, ` : ""}가중치 : ${m.weight}점)`),
          ...unchanged.filter((u) => u.business === biz).map((u) => u.line),
        ],
        pdf_page_start: Math.min(18, ...pages),
        pdf_page_end: Math.max(18, ...pages),
        meta: meta([`${OLD}/${biz}`], { points: total, metric_count: rows.length - 1 }),
      }),
    );
    for (const m of own) {
      count(biz);
      chunks.push(
        makeChunk({
          chunk_key: `${docId}/handbook26/${biz}/m${m.no}`,
          doc_id: docId,
          unit_type: "handbook_indicator",
          track: "주요사업",
          business: biz,
          eval_item: null,
          measure: "계량",
          q_type: ["편람"],
          title: `${PREFIX} · ${businessShort(biz)} 계량 · ${m.name}`,
          context_prefix: `${PREFIX} · ${businessLabel(biz)} · 계량지표 (${m.no}) ${m.name}${m.method ? ` · 평가방식 ${m.method}` : ""} · 가중치 ${m.weight}점`,
          blocks: m.fields.map(fieldText),
          pdf_page_start: m.page,
          pdf_page_end: m.pageEnd,
          // 옛 편람의 (1)번 지표(복합지표)를 나눈 것 — 새 지표도 그 자리의 기준을 대신함
          meta: meta([`${OLD}/${biz}/m1`], { metric_2026: m.name, metric_no: m.no, method: m.method, weight: m.weight, new_metric: m.isNew }),
        }),
      );
    }
  }

  const out = finalizeChunks(chunks);
  const sortKeys = (o: Record<string, number>) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  checks.push({ name: "편람 수정 조각 수", level: "error", ok: out.length === HANDBOOK_REV_EXPECTED.chunks, expected: HANDBOOK_REV_EXPECTED.chunks, actual: out.length });
  checks.push({ name: "편람 수정 단위별 조각 수", level: "error", ok: sortKeys(counts) === sortKeys(HANDBOOK_REV_EXPECTED.perUnit), expected: HANDBOOK_REV_EXPECTED.perUnit, actual: counts });
  checks.push({ name: "편람 수정 경영관리 구성요소가 옛 편람 자리와 맞음", level: "error", ok: mismatch.length === 0, expected: "평가지표·적용대상·지표정의 일치", actual: mismatch.length ? mismatch : "모두 맞음" });
  const gotPoints = Object.fromEntries((["BZ-2", "BZ-3"] as const).map((b) => [b, Number(summary.find((r) => r.business === b && /^\d+\./.test(r.name))?.total ?? NaN)]));
  checks.push({ name: "편람 수정 총괄요약표 사업 배점(수정)", level: "error", ok: sortKeys(gotPoints) === sortKeys(HANDBOOK_REV_EXPECTED.points) && gotPoints["BZ-2"] === points["BZ-2"] && gotPoints["BZ-3"] === points["BZ-3"], expected: HANDBOOK_REV_EXPECTED.points, actual: { 총괄요약표: gotPoints, 사업제목: points } });
  const gotWeights = Object.fromEntries(
    (["BZ-2", "BZ-3"] as const).map((b) => [b, summary.filter((r) => r.business === b && !/^\d+\./.test(r.name)).map((r) => Number(r.quant || r.nonQuant))]),
  );
  checks.push({ name: "편람 수정 총괄요약표 지표 가중치(수정)", level: "error", ok: JSON.stringify(gotWeights) === JSON.stringify(HANDBOOK_REV_EXPECTED.weights), expected: HANDBOOK_REV_EXPECTED.weights, actual: gotWeights });
  // 지표 머리의 가중치·번호가 총괄요약표와 같음(바뀐·새 지표 + 바뀌지 않은 지표 목록)
  const headWeights = Object.fromEntries(
    (["BZ-2", "BZ-3"] as const).map((b) => [
      b,
      [...metrics.filter((m) => m.business === b).map((m) => [m.no, m.weight] as const), ...unchanged.filter((u) => u.business === b).map((u) => METRIC_HEAD.exec(u.line)!).map((m) => [Number(m[1]), Number(m[4])] as const)].sort((x, y) => x[0] - y[0]).map(([, w]) => w),
    ]),
  );
  checks.push({ name: "편람 수정 지표 머리 가중치 = 총괄요약표", level: "error", ok: JSON.stringify(headWeights) === JSON.stringify(HANDBOOK_REV_EXPECTED.weights), expected: HANDBOOK_REV_EXPECTED.weights, actual: headWeights });
  const newGot = metrics.filter((m) => m.isNew).map((m) => `${m.business}/m${m.no}`);
  checks.push({ name: "편람 수정 신설 지표", level: "error", ok: JSON.stringify(newGot) === JSON.stringify(HANDBOOK_REV_EXPECTED.newMetrics), expected: HANDBOOK_REV_EXPECTED.newMetrics, actual: newGot });
  const emptyMetric = metrics.filter((m) => !fieldOf(m.fields, "정의") || !fieldOf(m.fields, "측정 산식 및 변수")).map((m) => `${m.business}/m${m.no}`);
  checks.push({ name: "편람 수정 지표마다 정의·측정 산식 있음", level: "error", ok: emptyMetric.length === 0, expected: "모두 있음", actual: emptyMetric.length ? emptyMetric : "모두 있음" });
  const outOfPages = out.filter((c) => {
    const [from, to] = HANDBOOK_REV_EXPECTED.pages[c.track === "주요사업" ? "biz" : "mg"];
    return (c.pdf_page_start ?? 0) < from || (c.pdf_page_end ?? 0) > to;
  });
  checks.push({ name: "편람 수정 조각이 읽는 쪽 범위 안(경영관리 3~9·주요사업 18~22)", level: "error", ok: outOfPages.length === 0, actual: outOfPages.map((c) => c.chunk_key) });
  checks.push({ name: "편람 수정 붙일 곳 없는 「수정」 칸 없음", level: "error", ok: stray === 0, expected: 0, actual: stray });
  const leaked = out.filter((c) => /~~|\(신\s*설\)/.test(c.text)).map((c) => c.chunk_key);
  checks.push({ name: "편람 수정 조각에 기존 쪽 표시(취소선·(신 설)) 없음", level: "error", ok: leaked.length === 0, actual: leaked });
  return { chunks: out, checks };
}
