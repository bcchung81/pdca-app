// 과제별 초안 화면의 파생 값 계산(순수 — 조회는 load.ts, 그리기는 report-card-*.tsx). 동작은 page.tsx에서 옮기기 전과 같음
import type { OutlineData } from "../../../../../components/reports/outline-panel";
import type { SourceFile } from "../../../../../components/reports/draft-workbench";
import type { MenuItem } from "../../../../../components/reports/draft-workspace";
import type { DraftMeta } from "../../../../../components/reports/draft-compose";
import { compareTaskNo } from "../../../../../lib/cards/view.ts";
import { kpiGaps, needsIn, yearActuals } from "../../../../../lib/reports/actuals.ts";
import { FIGURE_KINDS, FIGURE_LABEL, figuresOf } from "../../../../../lib/reports/blocks.ts";
import { type Composition, MATERIAL_KINDS, MATERIAL_LABEL, RESULT_SHAPES, RESULT_SHAPE_LABEL, editOf } from "../../../../../lib/reports/composition.ts";
import { SHEET_CSS } from "../../../../../lib/reports/composition-sheet.ts";
import { LABEL_SUGGESTIONS } from "../../../../../lib/reports/frameworks.ts";
import { lensCover } from "../../../../../lib/reports/lens-cover.ts";
import { outlineText } from "../../../../../lib/reports/outline-text.ts";
import { outlineView, shapeTable } from "../../../../../lib/reports/outline-view.ts";
import { type PriorSection, pickPrior, priorLabel, scorePrior } from "../../../../../lib/reports/prior.ts";
import { PRIOR_SAME_SCORE, type ReportSectionSpec, sectionText } from "../../../../../lib/reports/section.ts";
import { REPORT_CSS } from "../../../../../lib/reports/section-css.ts";
import { overflowLimitMm } from "../../../../../lib/reports/dom-hwpx/policy.ts";
import { axesFor } from "../../../../../lib/reports/split-axes.ts";
import { withReturn } from "../../../../../lib/nav/return-to.ts";
import { fmtDateTime } from "../../../../../lib/format.ts";
import type { CardRow, DraftRow, MaterialRowDb, ReportCardData, ReportRef, SiblingRow } from "./load.ts";

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

/** 근거 창에 넘기는 「이 초안이 쓴 첨부」 */
export function usedOf(spec: ReportSectionSpec | null, draft: DraftRow | null) {
  const sources = spec?.sources;
  return spec && draft?.updated_at ? (sources ? { card: sources.filter((s) => s.kind === "card").map((s) => s.id), report: sources.filter((s) => s.kind === "report").map((s) => s.id), at: String(draft.updated_at) } : null) : null;
}

/**
 * 머리 더보기 메뉴. 한글 내려받기(2026-10-28): 두 트랙 모두 「화면 그대로」(DOM 방식 — 초안 판 version이 있을 때)가 기본이고,
 * 실패하면 기존 양식을 안내 — 주요사업은 「한글(기존 양식)」(A안 ?form=a)·「한글(개조식)」, 경영관리는 「한글(개조식)」(경영관리의 기존 양식)
 */
export function menuOf(o: { uid: string; teamQs: string; selfHref: string; reportId: number | null; staffView: boolean; mg: boolean; evalUnitId: string; hasSpec: boolean; version: string | null; module: number }): MenuItem[] {
  const { uid, teamQs, selfHref } = o;
  const htmlHref = `/reports/cards/${uid}/html`;
  const hwpxHref = `/reports/cards/${uid}/hwpx`;
  const formA = { href: `${hwpxHref}?form=a`, label: "한글(기존 양식)" };
  const gaejo = { href: `${hwpxHref}?form=gaejo`, label: "한글(개조식)" };
  const dom: MenuItem[] =
    o.hasSpec && o.version
      ? [
          {
            href: hwpxHref,
            label: "한글 내려받기",
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
    ...(o.hasSpec ? [{ href: htmlHref, label: "HTML 내려받기", hint: "이 초안을 HTML 한 파일로", download: true }] : []),
    // 한글: 화면 그대로(기본) + 기존 양식(주요사업 A안 — 경영실적보고서 용지, 상자·칸 도식, 그림은 크기대로 빈 자리) + 개조식 원고(route.ts)
    ...dom,
    ...(o.hasSpec && !o.mg ? [{ ...formA, hint: "예전 변환(HWPX) — 초안을 양식대로 다시 짬, 그림은 크기대로 빈 자리", download: true }] : []),
    ...(o.hasSpec ? [{ ...gaejo, hint: "개조식 원고(HWPX) — 도식은 표·목록으로 펼침, 그림은 자리표시 줄", download: true }] : []),
    { href: "/help#report-fonts", label: "글꼴 안내", hint: "화면·한글을 같은 글꼴로 — KoPub 2.0 설치" },
  ];
}

/**
 * 「점검 결과」 탭 재료: 편람 논점(낱말 신호) · 근거 약한 문장 · 채울 자료(초안의 【확인: …】 + 올해 계량 실적을 아직 안 넣은 지표 + 그림 자리표시)
 * 편람 논점 커버(4단계 검증 보강)는 초안 글에 그 논점의 낱말이 있는지만 보는 신호 — 판정이 아님
 */
export function checkNeedsOf(spec: ReportSectionSpec | null, cardData: unknown, report: ReportRef | null) {
  const cover = spec && lensCover(spec);
  const weakSentences = spec?.ground?.weak ?? [];
  const draftNeeds = spec ? needsIn(sectionText(spec)) : [];
  // 그림 자리표시(사진·삽화·지도·화면·로고 — 초안은 자리만, 담당자가 채움). 같은 설명이 여럿이면 몇 번째인지(nth)로 찾음
  const figureNeeds = (spec?.blocks ? figuresOf(spec.blocks) : []).map((f, i, all) => ({ ...f, nth: all.slice(0, i).filter((x) => x.desc === f.desc).length }));
  const kpiNeeds = kpiGaps(yearActuals(cardData, report?.inputs?.kpi ?? {}));
  return { cover, weakSentences, draftNeeds, figureNeeds, kpiNeeds };
}

/** 구성안 화면 재료(오른쪽 AI 초안 탭 패널 + 왼쪽 여백 메모 + 구성안 판면). 머리 모드(사업 단위 조판)는 만들 때 값 */
export function outlineDataOf(composition: Composition | null, draft: DraftRow | null, spec: ReportSectionSpec | null, outlineModule: number): OutlineData | null {
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
      table: shapeTable(),
      labels: [...LABEL_SUGGESTIONS],
      // 갈래 축 사전(이 트랙에서 쓰는 축 — lib/reports/split-axes.ts, 2026-10-13)
      axes: axesFor(composition.mg ? "mg" : "biz").map((a) => ({ name: a.name, def: a.def, values: a.values })),
    },
    edit: editOf(composition),
    // 저장할 때 센 재료 대조·경영관리 절 겹침(같은 지표 다른 카드 — 마지막 저장 때 기준)은 저장된 경고에서, 나머지 점검(판면·틀·재료 없는 블록 등)은 지금 구성안으로 다시 셈
    view: outlineView(composition, outlineModule, outlineHead, Array.isArray(draft?.outline_warnings) ? draft.outline_warnings.map(String).filter((w: string) => w.startsWith("재료:") || w.startsWith("겹침:") || w.startsWith("갈래:")) : []),
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
 * 「AI 초안」 탭 단계 레일 재료(2026-10-21 — 셈은 lib/reports/draft-stage.ts): 원장 바뀜·구성안대로 짜임·판면·점검 나눔·구성안 메타 한 줄과
 * 「제출은 …에서」 링크(부서 = 부서 허브, 부서 화면 보기 = 그 부서 허브 ?team=, 성과관리팀·관리자 = 이 사업·부서 보고서 검토가 있으면 그쪽)
 */
export function draftMetaOf(o: { uid: string; spec: ReportSectionSpec | null; draft: DraftRow | null; hasOutline: boolean; stale: boolean; need: number; warn: number; staff: boolean; deptView: boolean; teamQs: string; report: ReportRef | null }): DraftMeta {
  const { spec, draft } = o;
  const submit = !o.staff
    ? { href: "/my/report", label: "확정은 경평 초안 허브에서" }
    : o.deptView
      ? { href: `/my/report${o.teamQs}`, label: "확정은 경평 초안 허브에서" }
      : o.report
        ? { href: withReturn(`/reports/${o.report.id}`, `/reports/cards/${o.uid}`), label: "승인은 보고서 검토에서" }
        : null;
  return {
    stale: o.stale,
    plan: spec?.plan ? { matched: spec.plan.matched, total: spec.plan.total } : null,
    fit: spec?.fit?.budget ? { total: spec.fit.total, budget: spec.fit.budget } : null,
    need: o.need,
    warn: o.warn,
    outlineInfo: o.hasOutline ? `${draft?.outline_model ?? "AI"} · ${fmtDateTime(draft?.outline_at)}` : null,
    submit,
  };
}
