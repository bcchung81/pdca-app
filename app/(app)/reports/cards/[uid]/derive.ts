// 과제별 초안 화면의 파생 값 계산(순수 — 조회는 load.ts, 그리기는 report-card-*.tsx). 동작은 page.tsx에서 옮기기 전과 같음
import type { OutlineData } from "../../../../../components/reports/outline-panel";
import type { BizRef, SourceFile } from "../../../../../components/reports/draft-workbench";
import type { MenuItem } from "../../../../../components/reports/draft-workspace";
import { isMgmtCard } from "../../../../../lib/cards/mgmt-card.ts";
import { compareTaskNo, compareUnitId } from "../../../../../lib/cards/view.ts";
import { type LinkIndexRow, bizTaskIdsIn } from "../../../../../lib/inspections/biz-links.ts";
import type { BizRefRow } from "../../../../../lib/reports/mg-biz-queries.ts";
import { kpiGaps, needsIn, yearActuals } from "../../../../../lib/reports/actuals.ts";
import { FIGURE_KINDS, FIGURE_LABEL, figuresOf } from "../../../../../lib/reports/blocks.ts";
import { type Composition, MATERIAL_KINDS, MATERIAL_LABEL, RESULT_SHAPES, RESULT_SHAPE_LABEL, editOf } from "../../../../../lib/reports/composition.ts";
import { SHEET_CSS } from "../../../../../lib/reports/composition-sheet.ts";
import { LENS_AXES, lensCover } from "../../../../../lib/reports/lens-cover.ts";
import { LABEL_SUGGESTIONS, storyLabel } from "../../../../../lib/reports/frameworks.ts";
import { type DraftThreadData, type ThreadOutlineIn, draftThread, draftTodo, threadStatus } from "../../../../../lib/reports/draft-thread.ts";
import { mgPartLabel } from "../../../../../lib/reports/mg-outline.ts";
import { outlineText } from "../../../../../lib/reports/outline-text.ts";
import { outlineView, shapeTable } from "../../../../../lib/reports/outline-view.ts";
import { mgPdcaSkeleton } from "../../../../../lib/reports/mg-pdca.ts";
import { type PriorSection, pickPrior, priorLabel, scorePrior } from "../../../../../lib/reports/prior.ts";
import { PRIOR_SAME_SCORE, type ReportSectionSpec, sectionText } from "../../../../../lib/reports/section.ts";
import { REPORT_CSS } from "../../../../../lib/reports/section-css.ts";
import { overflowLimitMm } from "../../../../../lib/reports/dom-hwpx/policy.ts";
import { axesFor } from "../../../../../lib/reports/split-axes.ts";
import { withReturn } from "../../../../../lib/nav/return-to.ts";
import { fmtDateTime, isoDay } from "../../../../../lib/format.ts";
import type { CardRow, DraftRow, EditRow, MaterialRowDb, ReportCardData, ReportRef, SiblingRow } from "./load.ts";

/** 성과관리팀 코멘트(점검 결과 탭 — 이 카드의 부서 보고서에서 이 과제 앵커만): card:<uid>(과제 전체)·card:<uid>#b<블록 순번> */
export function cardCommentsOf(comments: ReportCardData["comments"], uid: string) {
  return comments
    .filter((c) => c.anchor === `card:${uid}` || c.anchor.startsWith(`card:${uid}#`))
    .map((c) => {
      const m = /^card:.*#b(\d+)$/.exec(c.anchor);
      return { ...c, blockIndex: m ? Number(m[1]) : null };
    })
    .sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? 1 : -1) : a.status === "open" ? -1 : 1));
}

/** 근거 고르기 재료: 카드 전용 자료와(보고서가 있으면) 보고서 추가자료 */
export function sourceFilesOf(data: Pick<ReportCardData, "matRows" | "signed" | "report" | "reportMats">, cardId: string) {
  const { matRows, signed, report, reportMats } = data;
  const cardFiles: SourceFile[] = matRows.map((m: MaterialRowDb, i: number) => ({
    id: String(m.id),
    fileName: m.file_name,
    bytes: m.bytes,
    url: signed?.[i]?.signedUrl ?? null,
    createdAt: m.created_at,
    attachable: m.parse_status !== "failed",
    parseError: m.parse_error ?? null,
    chars: m.parsed_chars ?? null,
  }));
  const reportFiles: SourceFile[] | null = report
    ? reportMats.map((m) => {
        const relation: SourceFile["relation"] = m.matches.some((x) => x.cardId === cardId) ? "matched" : "same-report";
        return { id: String(m.id), fileName: m.fileName, bytes: m.bytes, url: m.url, createdAt: m.createdAt, attachable: m.parseStatus !== "failed", parseError: m.parseError, chars: m.chars, relation };
      })
    : null;
  return { cardFiles, reportFiles };
}

/** 전년도 보고서 같은 과제 절: 같은 주요사업 절 모두(닮은 순) + 자동으로 고를 절 */
export function priorChoices(cardData: unknown, priorSections: PriorSection[]) {
  const options = scorePrior(cardData, priorSections).map((p) => ({ key: p.section.key, label: priorLabel(p.section), score: p.score, same: p.score >= PRIOR_SAME_SCORE }));
  const auto = pickPrior(cardData, priorSections).map((p) => p.section.key);
  return { options, auto };
}

/** 앞뒤 과제(‹ ›): 성과관리팀·관리자는 목차 순서(report_outline.sort, 없으면 과제번호), 부서는 과제번호 순(자기 부서 안) */
export function neighborsOf(sibs: SiblingRow[], outlineSort: Array<{ card_id: string; sort: number }>, staffView: boolean, uid: string) {
  const sortOf = new Map(outlineSort.map((o) => [o.card_id, o.sort] as const));
  const list = [...sibs].sort((a, b) => {
    if (staffView) {
      const sa = sortOf.get(a.id);
      const sb = sortOf.get(b.id);
      if (sa !== undefined && sb !== undefined) return sa - sb;
      if (sa !== undefined) return -1;
      if (sb !== undefined) return 1;
    }
    return compareTaskNo(a.task_no, b.task_no);
  });
  const at = list.findIndex((s) => s.uid === uid);
  const prev = at > 0 ? list[at - 1] : null;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;
  return { prev, next };
}

/** 초안이 쓴 근거 갈래: 첨부(카드·보고서)·평가 근거·전년 절 */
export function sourceGroups(spec: ReportSectionSpec | null) {
  const sources = spec?.sources;
  return {
    sources,
    files: (sources ?? []).filter((s) => s.kind === "card" || s.kind === "report"),
    lensUsed: (sources ?? []).filter((s) => s.kind === "lens"),
    priorUsed: (sources ?? []).filter((s) => s.kind === "prior"),
  };
}

/** 근거 창에 넘기는 「이 초안이 쓴 첨부」(biz = 참고한 주요사업 경평 초안의 카드 id) */
export function usedOf(spec: ReportSectionSpec | null, draft: DraftRow | null) {
  const sources = spec?.sources;
  return spec && draft?.updated_at
    ? sources
      ? { card: sources.filter((s) => s.kind === "card").map((s) => s.id), report: sources.filter((s) => s.kind === "report").map((s) => s.id), biz: sources.filter((s) => s.kind === "biz").map((s) => s.id), at: String(draft.updated_at) }
      : null
    : null;
}

/**
 * 참고할 주요사업 경평 초안 후보(경영관리 카드일 때만 데이터가 있음 — 없으면 빈 목록이라 화면이 묶음을 그리지 않음).
 * 추천 까닭: (a) 이 카드 글(cardOutline)이 인용한 주요사업 번호 (b) 지침 13 연계 색인의 이 지표 행. 정렬: 추천 → 주요사업 번호(숫자 순 — localeCompare 글자 순 금지).
 * 낡음 = 지난 초안이 참고한 지문(spec.sources의 biz stamp)이 지금과 다름
 */
export function bizChoicesOf(rows: BizRefRow[], o: { spec: ReportSectionSpec | null; cardText: string; unitId: string; linkIndex: LinkIndexRow[] }): BizRef[] {
  if (!rows.length) return [];
  const cited = new Set(bizTaskIdsIn(o.cardText));
  const linked = new Set(o.linkIndex.find((r) => r.unit === o.unitId)?.ids ?? []);
  const saved = new Map((o.spec?.sources ?? []).filter((s) => s.kind === "biz").map((s) => [s.id, s.stamp] as const));
  return rows
    .map((r): BizRef => ({
      id: r.cardId,
      taskId: r.taskId,
      title: r.title,
      team: r.team,
      updatedAt: r.updatedAt,
      chars: r.chars,
      unknownCount: r.unknownCount,
      reasons: [...(cited.has(r.taskId) ? (["a"] as const) : []), ...(linked.has(r.taskId) ? (["b"] as const) : [])],
      stale: Boolean(saved.get(r.cardId)) && saved.get(r.cardId) !== r.stamp,
    }))
    .sort((a, b) => Number(b.reasons.length > 0) - Number(a.reasons.length > 0) || compareUnitId(a.taskId.split(" ")[0], b.taskId.split(" ")[0]) || compareTaskNo(a.taskId.split(" ")[1] ?? "", b.taskId.split(" ")[1] ?? ""));
}

/** 이 경영관리 초안이 참고한 주요사업 초안 중 그 뒤 바뀐(또는 지워진) 것 — 도구줄·대화 표지용. 참고한 것이 없으면 빈 목록 */
export interface BizStaleItem {
  cardId: string;
  /** 「3-나」 */
  taskNo: string;
  /** 바뀐 날짜(지워졌으면 null) */
  at: string | null;
}
export function bizStaleOf(spec: ReportSectionSpec | null, rows: BizRefRow[]): BizStaleItem[] {
  const now = new Map(rows.map((r) => [r.cardId, r] as const));
  const out: BizStaleItem[] = [];
  for (const s of spec?.sources ?? []) {
    if (s.kind !== "biz") continue;
    const cur = now.get(s.id);
    if (cur && cur.stamp === s.stamp) continue;
    out.push({ cardId: s.id, taskNo: cur?.taskNo ?? /\d{1,2}-[가-힣]/.exec(s.name)?.[0] ?? s.name, at: cur?.updatedAt ?? null });
  }
  return out.sort((a, b) => compareTaskNo(a.taskNo, b.taskNo));
}

/** 낡음 표지 글·title(도구줄·대화 공용 — 「3-나 외 2」) */
export function bizStaleLabel(items: BizStaleItem[]): { text: string; title: string } | null {
  if (!items.length) return null;
  const first = items[0].taskNo;
  return {
    text: `참고한 주요사업 초안이 바뀜 — ${first}${items.length > 1 ? ` 외 ${items.length - 1}` : ""}`,
    title: items.map((i) => `${i.taskNo}: ${i.at ? `${fmtDateTime(i.at)}에 바뀜` : "지워짐"}`).join("\n"),
  };
}

/**
 * 머리 더보기 메뉴. HWPX 내려받기(2026-10-28): 두 트랙 모두 「화면 그대로」(DOM 방식 — 초안 판 version이 있을 때)가 기본이고,
 * 실패하면 기존 양식을 안내 — 주요사업은 「HWPX(기존 양식)」(A안 ?form=a)·「HWPX(개조식)」, 경영관리는 「HWPX(개조식)」(경영관리의 기존 양식)
 */
export function menuOf(o: { uid: string; teamQs: string; selfHref: string; reportId: number | null; staffView: boolean; mg: boolean; evalUnitId: string; hasSpec: boolean; version: string | null; module: number }): MenuItem[] {
  const { uid, teamQs, selfHref } = o;
  const hwpxHref = `/reports/cards/${uid}/hwpx`;
  const formA = { href: `${hwpxHref}?form=a`, label: "HWPX(기존 양식)" };
  const gaejo = { href: `${hwpxHref}?form=gaejo`, label: "HWPX(개조식)" };
  const dom: MenuItem[] =
    o.hasSpec && o.version
      ? [
          {
            href: hwpxHref,
            label: "HWPX 내려받기",
            hint: o.mg ? "화면 그대로(HWPX) — 미리보기 배치대로 옮김, 여러 쪽은 한글이 나눔" : "화면 그대로(HWPX) — 미리보기 배치대로 상자·표·그림을 옮김",
            dom: { uid, version: o.version, limitMm: overflowLimitMm({ mg: o.mg, module: o.module }), fallback: o.mg ? gaejo : formA },
          },
        ]
      : [];
  return [
    { href: withReturn(`/cards/${uid}${teamQs}`, selfHref), label: "카드 보기", hint: "과제관리카드 전체 페이지" },
    ...(o.reportId !== null ? [{ href: withReturn(`/reports/${o.reportId}${teamQs}#평가내용2`, selfHref), label: "보고서에서 보기", hint: "이 사업·부서 보고서의 평가내용2에 모아 보기" }] : []),
    // 사업 조판은 성과관리팀 화면(부서 담당자는 열 수 없음 — 부서 화면 보기에서도 숨김)
    ...(o.staffView && !o.mg ? [{ href: withReturn(`/reports/business/${encodeURIComponent(o.evalUnitId)}#bz-${uid}`, selfHref), label: "사업 조판에서 보기", hint: "주요사업 전체를 쪽에 이어 붙인 모습에서 이 과제" }] : []),
    // 한글: 화면 그대로(기본) + 기존 양식(주요사업 A안 — 경영실적보고서 용지, 상자·칸 도식, 그림은 크기대로 빈 자리) + 개조식 원고(route.ts)
    ...dom,
    ...(o.hasSpec && !o.mg ? [{ ...formA, hint: "예전 변환(HWPX) — 초안을 양식대로 다시 짬, 그림은 크기대로 빈 자리", download: true }] : []),
    ...(o.hasSpec ? [{ ...gaejo, hint: "개조식 원고(HWPX) — 도식은 표·목록으로 펼침, 그림은 자리표시 줄", download: true }] : []),
    { href: "/help#report-fonts", label: "글꼴 안내", hint: "화면·한글을 같은 글꼴로 — KoPub 2.0 설치" },
  ];
}

/**
 * 할 일 재료(오른쪽 대화의 「채울 자료」 — lib/reports/draft-thread.ts draftTodo가 행동별로 묶음): 근거 약한 문장 · 초안의 【확인: …】 · 원장에 올해 실적이 없는 지표 · 그림 자리표시.
 * 편람 논점 커버(낱말 신호 — 판정 아님)는 2026-11-04부터 초안 답 첫 줄의 title로만(칩 없음)
 */
export function checkNeedsOf(spec: ReportSectionSpec | null, cardData: unknown) {
  const cover = spec && lensCover(spec);
  const weakSentences = spec?.ground?.weak ?? [];
  const draftNeeds = spec ? needsIn(sectionText(spec)) : [];
  // 그림 자리표시(사진·삽화·지도·화면·로고 — 초안은 자리만, 담당자가 채움). 같은 설명이 여럿이면 몇 번째인지(nth)로 찾음
  const figureNeeds = (spec?.blocks ? figuresOf(spec.blocks) : []).map((f, i, all) => ({ ...f, nth: all.slice(0, i).filter((x) => x.desc === f.desc).length }));
  const kpiNeeds = kpiGaps(yearActuals(cardData, isoDay(), { wide: isMgmtCard(cardData as Parameters<typeof isMgmtCard>[0]) }));
  // 편람 논점 낱말 신호(title 한 줄 — 「편람 논점 낱말(판정 아님): 실행 ✓ · 효율 —」)
  const lensNote = cover ? `편람 논점 낱말(판정 아님): ${LENS_AXES.map((k) => `${k} ${cover.checks[k] ? "✓" : "—"}`).join(" · ")}` : "";
  return { weakSentences, draftNeeds, figureNeeds, kpiNeeds, lensNote };
}

/** 구성안 화면 재료(오른쪽 AI 초안 탭 패널 + 왼쪽 여백 메모 + 구성안 판면). 머리 모드(사업 단위 조판)는 만들 때 값. cardData = 카드 원장(경영관리 구성안 점검 「PDCA」의 뼈대) */
export function outlineDataOf(composition: Composition | null, draft: DraftRow | null, spec: ReportSectionSpec | null, outlineModule: number, cardData?: unknown): OutlineData | null {
  if (!composition) return null;
  const outlineHead = composition.head ?? "all";
  return {
    outline: composition,
    status: draft?.outline_status === "approved" ? "approved" : "draft",
    model: draft?.outline_model ?? null,
    at: draft?.outline_at ?? null,
    hasDraft: Boolean(spec),
    names: {
      figures: FIGURE_KINDS.map((kind) => ({ kind, label: FIGURE_LABEL[kind] })),
      materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, MATERIAL_LABEL[k]])),
      results: RESULT_SHAPES.map((key) => ({ key, label: RESULT_SHAPE_LABEL[key] })),
      table: shapeTable(Boolean(composition.mg)),
      labels: [...LABEL_SUGGESTIONS],
      // 갈래 축 사전(이 트랙에서 쓰는 축 — lib/reports/split-axes.ts, 2026-10-13)
      axes: axesFor(composition.mg ? "mg" : "biz").map((a) => ({ name: a.name, def: a.def, values: a.values })),
    },
    edit: editOf(composition),
    // 저장할 때 센 재료 대조·경영관리 절 겹침(같은 지표 다른 카드 — 마지막 저장 때 기준)은 저장된 경고에서, 나머지 점검(판면·틀·재료 없는 블록 등)은 지금 구성안으로 다시 셈
    view: outlineView(composition, outlineModule, outlineHead, Array.isArray(draft?.outline_warnings) ? draft.outline_warnings.map(String).filter((w: string) => w.startsWith("재료:") || w.startsWith("겹침:") || w.startsWith("갈래:")) : [], composition.mg && cardData ? mgPdcaSkeleton(cardData) : undefined),
    sheetCss: REPORT_CSS + SHEET_CSS,
    text: outlineText(composition),
  };
}

/** 카드의 평가단위·팀 이름(join 결과가 배열로 올 때가 있어 한 줄로 고름) */
export function cardRefs(card: CardRow) {
  const unit = (Array.isArray(card.unit) ? card.unit[0] : card.unit) as { name: string; card_group: string | null } | null;
  const team = (Array.isArray(card.team) ? card.team[0] : card.team) as { name: string } | null;
  return { unit, team };
}

/**
 * 오른쪽 「AI 초안」 대화 재료(2026-11-04 — 셈은 lib/reports/draft-thread.ts): 저장된 구성안·초안·블록 고치기 이력으로 차례 목록,
 * 예전 「점검 결과」 탭 내용을 행동별로 묶은 할 일 하나, 머리 한 줄 상태, 「확정은 …에서」 링크(부서 = 부서 허브, 부서 화면 보기 = 그 부서 허브 ?team=,
 * 성과관리팀·관리자 = 이 사업·부서 보고서 검토가 있으면 그쪽)
 */
export function threadOf(o: {
  uid: string;
  composition: Composition | null;
  outline: OutlineData | null;
  draft: DraftRow | null;
  spec: ReportSectionSpec | null;
  stale: boolean;
  edits: EditRow[];
  needs: ReturnType<typeof checkNeedsOf>;
  warnings: string[];
  comments: ReturnType<typeof cardCommentsOf>;
  year: number;
  locked: boolean;
  staff: boolean;
  deptView: boolean;
  teamQs: string;
  report: ReportRef | null;
}): DraftThreadData {
  const { composition: c, spec, draft } = o;
  const outline: ThreadOutlineIn | null =
    c && o.outline
      ? {
          at: draft?.outline_at ?? null,
          approved: o.outline.status === "approved",
          approvedAt: draft?.outline_approved_at ?? null,
          story: c.mg ? "" : storyLabel(c.story, c.subStory),
          blocks: c.blocks.length,
          parts: (c.mg?.parts ?? []).map((p) => ({ name: mgPartLabel(p), story: storyLabel(p.story, p.subStory) })),
          fit: c.mg ? null : o.outline.view.fit,
          module: c.module ?? spec?.module ?? 1,
          message: c.message,
          points: o.outline.text.points,
          needs: c.materials.filter((m) => m.kind === "need").map((m) => m.text),
          frame: o.outline.text.frame,
          memo: c.memo ?? "",
        }
      : null;
  const turns = draftThread({
    outline,
    draft: spec ? { updatedAt: draft?.updated_at ?? null, plan: Boolean(spec.plan), revise: Boolean(spec.plan?.revise), fit: spec.fit?.budget ? { total: spec.fit.total, budget: spec.fit.budget } : null, module: spec.module, stale: o.stale, note: o.needs.lensNote } : null,
    edits: o.edits.map((e) => ({ id: Number(e.id), blockIndex: e.block_index, kind: e.kind, request: e.request ?? "", at: e.created_at, refId: e.ref_id })),
  });
  // 아직 집필하지 않은 구성안(마지막 차례가 구성안)의 자료 필요만 할 일에 — 집필한 뒤에는 초안의 【확인】이 남은 빈 곳
  const last = turns.at(-1);
  const { draftNeeds, figureNeeds, kpiNeeds, weakSentences } = o.needs;
  const todo = draftTodo({
    year: o.year,
    kpi: kpiNeeds,
    needs: draftNeeds,
    figures: figureNeeds.map((f) => ({ label: FIGURE_LABEL[f.kind], desc: f.desc, nth: f.nth })),
    warnings: spec ? o.warnings : [],
    weak: weakSentences,
    outlineNeeds: last?.kind === "outline" ? last.needs : [],
    comments: o.comments.map((x) => ({ body: x.body, meta: `${x.kind} · ${x.author} · ${fmtDateTime(x.createdAt)}`, blockIndex: x.blockIndex, open: x.status === "open" })),
  });
  const submit = !o.staff
    ? { href: "/my/report", label: "확정은 경평 초안 허브에서" }
    : o.deptView
      ? { href: `/my/report${o.teamQs}`, label: "확정은 경평 초안 허브에서" }
      : o.report
        ? { href: withReturn(`/reports/${o.report.id}`, `/reports/cards/${o.uid}`), label: "승인은 보고서 검토에서" }
        : null;
  return {
    turns,
    todo,
    status: threadStatus({ hasOutline: Boolean(c), approved: o.outline?.status === "approved", hasDraft: Boolean(spec), stale: o.stale, todo: todo.count, locked: o.locked }),
    submit,
  };
}
