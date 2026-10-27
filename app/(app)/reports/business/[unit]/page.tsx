import { ClipboardList, FileDown, SquarePen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessZoom, BusinessZoomColumn, BusinessZoomControl, BusinessZoomSheet } from "../../../../../components/reports/business-zoom";
import { WarningList } from "../../../../../components/reports/warning-list";
import { Empty, NoAccess, PageHeader, Panel, Screen, Tag, type Tone } from "../../../../../components/ui/kit";
import { requireAtLeast } from "../../../../../lib/auth/dal.ts";
import { compareUnitId, currentPeriod } from "../../../../../lib/cards/view.ts";
import { withReturn } from "../../../../../lib/nav/return-to.ts";
import { BUSINESS_CSS, outsideSheetHtml, sheetHtml } from "../../../../../lib/reports/business-html.ts";
import { type HeadMode, type LaidOutside, type LaidSection, OUTSIDE_FILL_MAX, SAME_TEXT_MIN, layoutBusiness, sheetsOf } from "../../../../../lib/reports/business-layout.ts";
import { FIT_BAND, PAGE_MM } from "../../../../../lib/reports/fit.ts";
import { PAGE_BUDGET } from "../../../../../lib/reports/outline.ts";
import { REPORT_CSS, UNIT_PARTS_CSS } from "../../../../../lib/reports/section-css.ts";
import { loadBusinessItems, loadMgUnitLayout } from "../../../../../lib/reports/unit-layout-queries.ts";
import { unitPartChapterHtml } from "../../../../../lib/reports/unit-parts-html.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";
import { loadUnitParts } from "./parts/actions";

export const metadata: Metadata = { title: "사업 조판 · 경평 초안 · 경평AI비서" };

const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const pagesLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}쪽`;
const STATE: Record<"under" | "ok" | "over", [string, Tone]> = { under: ["모자람", "warn"], ok: ["예산 안", "link"], over: ["넘침", "warnSolid"] };
const HEAD_LABEL: Record<HeadMode, string> = { all: "대상사업 상자부터", task: "실행과제 띠부터", sub: "제목만" };
// 경영관리: 앞 과제와 평가내용이 다르면 평가내용 상자부터(새 쪽), 같으면 대주제 띠부터, 대주제도 같으면 절 제목부터
const MG_HEAD_LABEL: Record<HeadMode, string> = { all: "평가내용 상자부터", task: "대주제 띠부터", sub: "절 제목부터" };
const MG_STATE: Record<"under" | "ok" | "over", [string, Tone]> = { under: ["예산보다 적음", "warn"], ok: ["예산 수준", "link"], over: ["예산보다 많음", "warn"] };
const FIT_LABEL: Record<NonNullable<LaidSection["fit"]>, [string, Tone]> = { over: ["넘침", "warnSolid"], under: ["모자람", "warn"], ok: ["맞음", "navy"] };

/**
 * 성과관리팀 · 경평 초안 사업 조판: 주요사업(평가단위) 하나의 평가내용2 과제별 초안을 목차·쪽 배정 순서대로 쪽(판면 170×255mm)에 이어 붙인 모습과
 * 사업 전체 검사(쪽 수 vs 15±1쪽, 소항목 사이 같은 문장·같은 짜임, 초안 없음·다시 만들기 권장). 보고서는 평가단위 × 작성 부서라 사업 전체가 여러
 * 보고서에 걸쳐 따로 봅니다. 쪽 나눔은 2025 최종본 관행(lib/reports/business-layout.ts). 읽기만 — 데이터는 로그인 사용자 권한(RLS).
 * 경영관리 지표(MG-N, 2026-10-10)도 같은 틀: 평가내용이 바뀌면 새 쪽, 쪽 수는 그 지표 본문 예산(작성분량 − 본문 아닌 내용 장, 카드가 맡은 평가내용 — 2026-10-12)과 견줌.
 */
export default async function BusinessLayoutPage({ params, searchParams }: PageProps<"/reports/business/[unit]">) {
  const { unit } = await params;
  const sp = await searchParams;
  const me = await requireAtLeast("pmo", `/reports/business/${encodeURIComponent(unit)}`);
  if (!me) return <NoAccess title="경평 초안 · 사업 조판" need="성과관리팀" />;
  const year = Number(currentPeriod().slice(0, 4));
  const supabase = await createClient();
  // 평가단위의 트랙(주소가 정함 — 경영관리 지표면 같은 틀에 지표 규칙)
  const { data: u } = await supabase.from("eval_units").select("id, name, card_group, track").eq("id", unit).not("card_group", "is", null).maybeSingle();
  if (!u) notFound();
  const mg = u.track === "경영관리";
  const unitWord = mg ? "지표" : "사업";
  // 대상사업 머리 지도(?map=1, 기본 끔 — 주요사업만, 경영관리 지표에는 대상사업이 없어 켜기를 보이지 않음)
  const mapOn = !mg && first(sp.map ?? null) === "1";
  // 머리 지도를 켜고 끄는 주소: 다른 쿼리(?from 등)는 그대로 두고 map만 바꿈
  const mapHref = (on: boolean) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "map") for (const x of [v ?? []].flat()) q.append(k, x);
    if (on) q.set("map", "1");
    const s = q.toString();
    return `/reports/business/${encodeURIComponent(unit)}${s ? `?${s}` : ""}`;
  };
  // 경영관리 지표: 카드 밖 부분(저장된 부분 또는 재료로 만든 초안)을 앞·뒤에 끼움(R5d) — 읽기 실패해도 본문 조판은 그대로
  const [{ data: unitRows }, { data: unitCards }, partsR] = await Promise.all([
    supabase.from("eval_units").select("id, name, card_group").eq("track", u.track).not("card_group", "is", null),
    supabase.from("cards").select("id").eq("eval_unit_id", unit).eq("status", "active"),
    mg ? loadUnitParts(unit) : Promise.resolve(null),
  ]);
  const units = [...(unitRows ?? [])].sort((a, b) => compareUnitId(a.id, b.id));
  // 과제별 초안·카드 원장으로 가는 링크가 돌아올 이 화면 주소
  const startQuery = Number(first(sp.start ?? null));
  const selfHref = `/reports/business/${encodeURIComponent(unit)}${mapOn ? "?map=1" : ""}${mg && startQuery > 0 ? `?start=${startQuery}` : ""}`;
  const view = partsR?.ok ? partsR.view : null;
  const loaded = mg ? await loadMgUnitLayout(supabase, unit, year, view, startQuery > 0 ? startQuery : null) : null;
  const items = loaded?.items ?? (await loadBusinessItems(supabase, unit, year));
  const inOutline = new Set(items.map((it) => it.cardId));
  const notInOutline = (unitCards ?? []).filter((c) => !inOutline.has(c.id as string)).length;
  // 경영관리 쪽 수 기준: 그 지표 본문 예산(작성분량 기준) 중 카드가 맡은 평가내용(목차·쪽 배정 화면과 같은 값 — mgCardPages)
  const ref = loaded?.ref;
  const layout = loaded?.layout ?? layoutBusiness(items, mapOn ? { map: true } : {});
  const { summary: sum, checks, outside } = layout;
  const sheets = sheetsOf(layout.pages);
  const byUid = new Map(layout.items.map((it) => [it.cardId, it.uid]));
  const rule = mg ? "평가내용이 바뀌면 새 쪽, 대주제·절·과제는 이어 씀(2025 지표별 보고서 — 평가내용 바뀜 25곳 중 24곳이 새 쪽). 카드 밖 부분: 지적사항 조치실적 + 전년 대비는 새 쪽에서 이어 쓰고 본문은 그 뒤 새 쪽, 성과분석 및 환류는 본문 뒤 새 쪽(2025 11개 지표 모두), 표지는 쪽 수에 안 셈" : "대상사업·실행과제가 바뀌면 새 쪽, 같은 실행과제는 이어 씀(2025 최종본 관행)";
  const heads = mg ? MG_HEAD_LABEL : HEAD_LABEL;
  const states = mg ? MG_STATE : STATE;
  // 조판 알림: 쪽 채움 경고(넘쳐 흐른 거의 빈 쪽 — 두 트랙 공통) + 카드 밖 부분 경고(넘침·전체 쪽 기준·빈 칸) + 부분을 못 읽었을 때
  const outsideNotes = [...layout.warnings, ...(outside?.warnings ?? []), ...(partsR && !partsR.ok ? [`카드 밖 부분을 불러오지 못해 본문만 조판했습니다 — ${partsR.message}`] : [])];
  const side = <SidePanel layout={layout} byUid={byUid} excluded={sum.excluded} notInOutline={notInOutline} from={selfHref} rule={rule} heads={heads} notes={outsideNotes} />;
  // 카드 밖 부분 종이: 표지(쪽 수에 안 셈) · 앞 · 뒤 — 장 조각은 카드 밖 부분 화면과 같은 렌더러(비고는 조판 결과의 쪽)
  const partOpts = { remarks: loaded?.remarks ?? {} };
  const coverHtml = view?.cover ? `<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame">${unitPartChapterHtml(view, "cover")}</div></div></div>` : "";
  const outsideHtml = (o: LaidOutside) => (view && o.pages ? outsideSheetHtml(o.firstPage, o.pages, o.chapters.map((c) => unitPartChapterHtml(view, c.key as "findings" | "prior" | "outcome", partOpts)).join("\n")) : "");
  const partsHref = withReturn(`/reports/business/${encodeURIComponent(unit)}/parts`, selfHref);

  return (
    <Screen
      header={
        <PageHeader title="경평 초안">
          {/* 경영관리 지표만: 카드 밖 부분(표지·지적사항 조치실적·전년 대비·성과분석 및 환류) 화면 — 돌아올 곳은 이 화면 */}
          {mg && (
            <Link
              href={partsHref}
              aria-label="카드 밖 부분"
              title="카드 밖 부분 — 표지·지적사항 조치실적·전년 대비 주요 추진실적·성과분석 및 환류"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-field-line text-ink no-underline hover:border-navy"
            >
              <ClipboardList size={16} aria-hidden />
            </Link>
          )}
          {/* 경영관리 지표만: 지표 한 파일 한글 내려받기(R5d) — 파일을 받는 주소라 Link(미리 불러오기) 대신 a */}
          {mg && (
            <a
              href={`/reports/business/${encodeURIComponent(unit)}/hwpx${startQuery > 0 ? `?start=${startQuery}` : ""}`}
              aria-label="한글 내려받기"
              title="한글 내려받기 — 표지·지적사항 조치실적·전년 대비·과제별 초안(목차 순)·성과분석 및 환류를 한 파일로. 한글에서 다듬는 출발 원고이며 장 사이 쪽 나눔은 한글에서"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-field-line text-ink no-underline hover:border-navy"
            >
              <FileDown size={16} aria-hidden />
            </a>
          )}
        </PageHeader>
      }
    >
      <BusinessZoom>
      {/* 한 줄 요약 막대(2026-09-28 — 쪽이 주 콘텐츠: 예전 요약 카드 4장·검사 패널·높이 표는 이 막대와 오른쪽 레일로 줄임). 내려도 위에 붙어 있음(-top-3 = Screen 위 여백만큼 올려 스크롤 상자 맨 위에) */}
      <div className="sticky -top-3 z-pop -mx-8 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-desk px-8 py-2">
        <nav aria-label={mg ? "지표 고르기" : "주요사업 고르기"} className="flex shrink-0 flex-wrap items-center gap-1">
          <span className="mr-0.5 text-xs font-semibold text-muted-2">{mg ? "지표" : "주요사업"}</span>
          {units.map((x, i) => (
            <Link
              key={x.id}
              href={`/reports/business/${encodeURIComponent(x.id)}${mapOn ? "?map=1" : ""}`}
              aria-current={x.id === unit ? "page" : undefined}
              title={mg ? x.name : `${x.card_group} · ${x.name}`}
              className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold no-underline ${x.id === unit ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}
            >
              {/(\d+)$/.exec(x.card_group ?? "")?.[1] ?? i + 1}
            </Link>
          ))}
        </nav>
        <b className="max-w-[320px] min-w-0 truncate font-serif text-base text-navy" title={mg ? u.name : `${u.card_group} · ${u.name}`}>
          {u.name}
        </b>
        {!mg && (
          <Link
            href={mapHref(!mapOn)}
            aria-pressed={mapOn}
            title={mapOn ? "대상사업 머리 지도 끄기" : "대상사업 첫 소항목에 실행과제·소항목 목록 상자(추진개요)를 넣어 봄 — 상자 높이가 쪽 나눔·넘침 검사에 더해짐"}
            className={`flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap no-underline ${mapOn ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}
          >
            머리 지도 {mapOn ? "켬" : "끔"}
          </Link>
        )}
        {items.length > 0 && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-ui">
            <Metric
              label={outside ? "본문" : "조판"}
              value={`${sum.laid}쪽`}
              note={mg ? `본문 예산 ${pagesLabel(sum.budget.target)} · ${states[sum.state][0]}` : `예산 ${PAGE_BUDGET.target}±${PAGE_BUDGET.tolerance} · ${states[sum.state][0]}`}
              warn={sum.state !== "ok"}
              title={`쪽에 이어 붙인 쪽 수 — ${rule}${mg ? ` · 그 지표 본문 예산(작성분량${ref?.volume !== undefined ? ` ${ref.volume}쪽` : ""} − 지적사항 조치실적·전년 대비·성과분석 및 환류 등) 중 카드가 맡은 평가내용 ${pagesLabel(sum.budget.target)}과 ±1쪽으로 견줌` : ""}`}
            />
            {outside && (
              <Metric
                label="카드 밖"
                value={`${outside.pages}쪽`}
                note={outside.pages2025 !== null ? `2025 ${outside.pages2025}쪽${outside.overflow > 0 ? ` · ${outside.overflow}쪽 넘침` : ""}` : undefined}
                warn={outside.overflow > 0}
                title={`지적사항 조치실적 + 전년 대비(앞 ${outside.front.pages}쪽) · 성과분석 및 환류(뒤 ${outside.back.pages}쪽) 어림 — 표 칸 폭·글자 수로 줄 수를 센 값이라 비어 있는 칸이 채워지면 늘어남. 표지는 쪽 수에 안 셈`}
              />
            )}
            {outside && (
              <Metric
                label="전체"
                value={`${outside.whole}쪽`}
                note={outside.wholeTarget !== null ? `작성분량 ${pagesLabel(outside.wholeTarget)}±1` : undefined}
                warn={outside.wholeState !== null && outside.wholeState !== "ok"}
                title={`지표 전체 = 앞 ${outside.front.pages} + 본문 ${sum.laid} + 뒤 ${outside.back.pages}쪽${outside.wholeTarget !== null ? ` — 작성분량(지표관리 방향 쪽은 뺌) ${pagesLabel(outside.wholeTarget)}과 ±1쪽으로 견줌` : ""}`}
              />
            )}
            <Metric label="배정" value={pagesLabel(sum.assigned)} note={states[sum.assignedState][0]} warn={sum.assignedState !== "ok"} href="/reports/outline" title={`목차·쪽 배정의 배정 합 · 빈 자리 ${Math.round(sum.blank)}mm — 누르면 목차·쪽 배정`} />
            <Metric label="초안" value={`${sum.drafted}/${sum.total}`} warn={checks.missing.length > 0 || checks.stale.length > 0} href="/reports/cards" title={`초안 없음 ${checks.missing.length} · 다시 만들기 권장 ${checks.stale.length} — 누르면 과제별 초안`} />
            <Metric label="같은 문장" value={String(checks.sameSentenceCount)} warn={checks.sameSentenceCount > 0} title={`서로 다른 소항목에서 글자 두 개 묶음이 ${Math.round(SAME_TEXT_MIN * 100)}% 넘게 겹치는 문장 쌍`} />
            <Metric label="같은 짜임" value={String(checks.sameLayouts.length)} warn={checks.sameLayouts.length > 0} title="블록 순서·모양이 똑같은 소항목 묶음(블록 목록 초안만)" />
            {/* 보고서 확대(과제별 초안과 같은 − % + — 기본은 쪽 보기 열 폭에 맞춤) */}
            <BusinessZoomControl />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <Panel>
          <Empty title={`이 ${unitWord}의 목차가 아직 없습니다.`}>
            <Link href="/reports/outline">목차·쪽 배정</Link>에서 목차를 만들면 과제별 초안을 쪽에 이어 붙여 볼 수 있습니다.
          </Empty>
        </Panel>
      ) : (
        <>
          {/* 좁은 창: 오른쪽 레일 대신 접기 */}
          <details className="min-w-0 rounded-lg border border-line bg-paper xl:hidden">
            <summary className="cursor-pointer px-4 py-2.5 text-ui font-semibold text-navy">검사·소항목 {layout.sections.length}</summary>
            {side}
          </details>

          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            {/* 쪽 보기(주 콘텐츠): 쪽마다 위에 한 줄 띠(쪽·채움·넘침·그 쪽의 소항목) + 종이 */}
            <section aria-label="쪽 보기" className="flex min-w-0 flex-col gap-6">
              <style>{REPORT_CSS + BUSINESS_CSS + (mg ? UNIT_PARTS_CSS : "")}</style>
              <BusinessZoomColumn>
              {/* 경영관리 카드 밖 부분(R5d): 표지(쪽 수에 안 셈) → 앞(지적사항 조치실적 + 전년 대비) → 본문 → 뒤(성과분석 및 환류). 읽기만 — 고치는 곳은 「카드 밖 부분」 화면 */}
              {coverHtml && (
                <div className="flex min-w-0 flex-col gap-2">
                  <div aria-label="표지 정보" className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span className="font-mono text-ui font-bold text-navy">표지</span>
                    <span className="text-muted-2">쪽 수에 안 셈(2025 쪽 번호 없음)</span>
                    <PartsLink href={partsHref} />
                  </div>
                  <div className="min-w-0 overflow-x-auto">
                    <BusinessZoomSheet html={coverHtml} />
                  </div>
                </div>
              )}
              {outside && outside.front.pages > 0 && (
                <OutsideSheet o={outside.front} remarkNote={loaded && loaded.start ? `비고 p.N = 시작 쪽 ${loaded.start}${loaded.startIsDefault ? "(2025 기준 — 주소에 ?start=쪽 번호로 바꿈)" : ""} + 쪽 − 1` : "비고 쪽: 지표 시작 쪽을 모름"} html={outsideHtml(outside.front)} href={partsHref} />
              )}
              {sheets.map((sheet) => {
                const pieces = sheet.flatMap((p) => p.pieces.map((x) => ({ ...x, page: p.no })));
                const over = sheet.reduce((n, p) => Math.max(n, p.over), 0);
                const label = sheet.length > 1 ? `${sheet[0].no}~${sheet.at(-1)!.no}쪽` : `${sheet[0].no}쪽`;
                return (
                  <div key={sheet[0].no} className="flex min-w-0 flex-col gap-2">
                    <div aria-label={`${label} 정보`} className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <span className="font-mono text-ui font-bold text-navy">{label}</span>
                      {sheet.map((p) => (
                        <span key={p.no} className={`font-mono ${p.fill > 1 ? "text-warn" : "text-muted-2"}`} title={`${p.no}쪽 ${p.used}mm / ${PAGE_MM.height}mm`}>
                          {sheet.length > 1 ? `${p.no}쪽 ` : ""}채움 {Math.round(p.fill * 100)}%
                        </span>
                      ))}
                      {over > 0 && (
                        <Tag tone="warnSolid" title="판면 어림이 쪽 높이를 조금 넘음 — 그 쪽 글을 줄여야 함">
                          넘침 +{over}mm
                        </Tag>
                      )}
                      {pieces.map((x) => {
                        const s = layout.sections[x.index];
                        return (
                          <span key={`${x.index}-${x.page}`} className="flex max-w-[380px] min-w-0 items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5">
                            <a href={`#bz-${s.uid}`} className="shrink-0 font-mono font-semibold text-navy no-underline hover:underline">
                              {s.taskNo}
                            </a>
                            <span className="min-w-0 truncate text-ink" title={s.title}>
                              {s.title}
                            </span>
                            <span className="shrink-0 text-muted-2" title={x.cont ? "앞 쪽에서 이어짐" : heads[s.head]}>
                              {x.cont ? "이어짐 · " : ""}
                              {x.height}mm{x.more ? " →" : ""}
                            </span>
                            {x.over && !x.cont && <Tag tone="warnSolid">배정 넘침</Tag>}
                            {!s.drafted && !x.cont && <Tag>초안 없음</Tag>}
                            {!x.cont && <WriteLink uid={s.uid} title={s.title} from={selfHref} />}
                          </span>
                        );
                      })}
                    </div>
                    <div className="min-w-0 overflow-x-auto">
                      <BusinessZoomSheet html={sheetHtml(sheet, layout, selfHref)} />
                    </div>
                  </div>
                );
              })}
              {outside && outside.back.pages > 0 && <OutsideSheet o={outside.back} html={outsideHtml(outside.back)} href={partsHref} />}
              </BusinessZoomColumn>
            </section>

            {/* 오른쪽 레일: 검사 + 소항목(누르면 그 쪽으로) — 내려도 따라옴 */}
            <aside aria-label="검사·소항목" className="sticky top-7 hidden max-h-[calc(100dvh-7.5rem)] min-w-0 flex-col overflow-y-auto rounded-lg border border-line bg-paper xl:flex">
              {side}
            </aside>
          </div>
        </>
      )}
      </BusinessZoom>
    </Screen>
  );
}

/** 요약 막대의 지표 하나(문제면 경고 색, 링크면 그 화면으로) */
function Metric({ label, value, note, warn, href, title }: { label: string; value: string; note?: string; warn?: boolean; href?: string; title?: string }) {
  const body = (
    <>
      <span className="text-muted-2">{label}</span>
      <span className={`font-mono font-bold ${warn ? "text-warn" : "text-navy"}`}>{value}</span>
      {note && <span className={`text-xs ${warn ? "text-warn" : "text-muted-2"}`}>{note}</span>}
    </>
  );
  return href ? (
    <Link href={href} title={title} className="flex items-baseline gap-1 whitespace-nowrap no-underline hover:underline">
      {body}
    </Link>
  ) : (
    <span title={title} className="flex items-baseline gap-1 whitespace-nowrap">
      {body}
    </span>
  );
}

/** 카드 밖 부분 화면으로 가는 작은 링크 */
function PartsLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs font-semibold text-link no-underline hover:underline">
      카드 밖 부분에서 고치기
    </Link>
  );
}

/** 카드 밖 장 묶음(앞·뒤) 쪽 보기: 위 한 줄 띠(쪽·채움·장 이름) + 종이 */
function OutsideSheet({ o, html, href, remarkNote }: { o: LaidOutside; html: string; href: string; remarkNote?: string }) {
  const label = o.pages > 1 ? `${o.firstPage}~${o.firstPage + o.pages - 1}쪽` : `${o.firstPage}쪽`;
  const fill = Math.round((o.mm / (o.pages * PAGE_MM.height)) * 100);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div aria-label={`${label} 정보`} className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <span className="font-mono text-ui font-bold text-navy">{label}</span>
        <span className={`font-mono ${fill > OUTSIDE_FILL_MAX * 100 ? "text-warn" : "text-muted-2"}`} title={`어림 ${o.mm}mm / 판면 ${o.pages * PAGE_MM.height}mm — 표 줄 수 어림이 2025 실측보다 5~10% 크게 나와 110%까지를 한 쪽으로 봄`}>
          채움 {fill}%
        </span>
        {o.chapters.map((c) => (
          <span key={c.key} className="flex max-w-[380px] min-w-0 items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5">
            <span className="min-w-0 truncate text-ink" title={c.title}>
              {c.title}
            </span>
            <span className="shrink-0 text-muted-2">{c.mm}mm</span>
          </span>
        ))}
        {remarkNote && <span className="text-muted-2">{remarkNote}</span>}
        <PartsLink href={href} />
      </div>
      <div className="min-w-0 overflow-x-auto">
        <BusinessZoomSheet html={html} />
      </div>
    </div>
  );
}

/** 과제별 초안 작성 화면 아이콘(돌아올 곳 = 이 화면) */
function WriteLink({ uid, title, from }: { uid: string; title: string; from: string }) {
  return (
    <Link href={withReturn(`/reports/cards/${uid}`, from)} title={`${title} — 작성 화면`} aria-label={`${title} 작성 화면`} className="flex size-6 shrink-0 items-center justify-center rounded text-link hover:bg-row-hover">
      <SquarePen size={13} aria-hidden="true" />
    </Link>
  );
}

/** 오른쪽 레일(좁은 창은 접기) 내용: 사업 전체 검사(0이 아닌 것만 자세히) + 소항목 목록 */
function SidePanel({ layout, byUid, excluded, notInOutline, from, rule, heads, notes = [] }: { layout: ReturnType<typeof layoutBusiness>; byUid: Map<string, string>; excluded: number; notInOutline: number; from: string; /** 쪽 나눔 규칙(범례 title) */ rule: string; /** 머리 모드 이름(트랙마다) */ heads: Record<HeadMode, string>; /** 조판 알림(쪽 채움·경영관리 카드 밖 부분) */ notes?: string[] }) {
  const { checks, sections, summary: sum } = layout;
  const row = "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2";
  const key = "pt-px text-muted-2";
  return (
    <div className="flex min-w-0 flex-col divide-y divide-line text-ui leading-5">
      {/* 쪽 보기 범례(예전에는 쪽 보기 위 한 줄 — 상단을 줄이려고 레일로 옮김) */}
      <p aria-label="쪽 보기 범례" title={rule} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-xs text-muted-2">
        <span className="whitespace-nowrap">
          <span className="mr-1 inline-block w-4 border-t border-dashed border-[#9a9b9a] align-middle" />쪽 경계
        </span>
        <span className="whitespace-nowrap">
          <span className="mr-1 inline-block w-4 border-t border-dashed border-[#c62828] align-middle" />판면 끝({PAGE_MM.height}mm)
        </span>
        <span className="whitespace-nowrap">
          <span className="mr-1 inline-block h-2.5 w-3.5 bg-[#fbe4e1] align-middle" />넘친 부분
        </span>
      </p>
      <section aria-label="사업 전체 검사" className="flex min-w-0 flex-col gap-2 px-4 py-3">
        <h2 className="flex items-center justify-between text-xs font-bold text-navy">
          검사
          <span className="font-normal text-muted-2">판정이 아니라 신호</span>
        </h2>
        <WarningList list={notes} title="조판 알림" headingClass="text-xs font-semibold text-muted" />
        {(excluded > 0 || notInOutline > 0) && (
          <p className="text-xs text-warn">
            {excluded > 0 && `목차에서 뺀 과제 ${excluded}개는 셈하지 않음. `}
            {notInOutline > 0 && (
              <>
                목차에 없는 과제 {notInOutline}개 — <Link href="/reports/outline">목차·쪽 배정</Link>
              </>
            )}
          </p>
        )}
        <div className={row}>
          <span className={key}>같은 문장</span>
          {checks.sameSentences.length === 0 ? (
            <span className="text-muted">없음{sum.drafted < 2 ? " (초안 둘 이상일 때)" : ""}</span>
          ) : (
            <details className="min-w-0">
              <summary className="cursor-pointer font-semibold text-warn">
                {checks.sameSentenceCount}쌍{checks.sameSentenceCount > checks.sameSentences.length ? ` · 닮은 순 ${checks.sameSentences.length}` : ""}
              </summary>
              <ul className="mt-1 flex min-w-0 flex-col gap-1.5">
                {checks.sameSentences.map((p, i) => (
                  <li key={i} className="min-w-0">
                    <span className="flex items-center gap-1 font-mono text-xs">
                      <a href={`#bz-${byUid.get(p.a.cardId)}`}>{p.a.taskNo}</a>↔<a href={`#bz-${byUid.get(p.b.cardId)}`}>{p.b.taskNo}</a>
                      <span className="ml-auto text-muted-2">{p.score.toFixed(2)}</span>
                    </span>
                    <span className="line-clamp-2 text-xs break-keep text-muted" title={`${p.a.text}\n${p.b.text}`}>
                      {p.a.text}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className={row}>
          <span className={key}>같은 짜임</span>
          {checks.sameLayouts.length === 0 ? (
            <span className="text-muted">없음</span>
          ) : (
            <ul className="flex min-w-0 flex-col gap-0.5">
              {checks.sameLayouts.map((g) => (
                <li key={g.signature} className="truncate font-mono text-xs text-warn" title={g.signature}>
                  {g.taskNos.join(" · ")}
                </li>
              ))}
            </ul>
          )}
        </div>
        {checks.stories.length > 0 && (
          <div className={row}>
            <span className={key}>이야기 틀</span>
            <span className="flex min-w-0 flex-wrap gap-1">
              {checks.stories.map((s) => (
                <Tag key={s.story} tone={s.taskNos.length > 1 ? "warn" : "muted"} title={s.taskNos.join(", ")}>
                  {s.story} {s.taskNos.length}
                </Tag>
              ))}
            </span>
          </div>
        )}
        <CardChips label="초안 없음" tone="muted" list={checks.missing.map((m) => ({ ...m, note: `배정 ${pagesLabel(m.pages)}` }))} from={from} row={row} keyCls={key} />
        <CardChips label="다시 만들기" tone="warnSolid" list={checks.stale} note="초안 뒤 원장이 바뀜 — 다시 만들기 권장" from={from} row={row} keyCls={key} />
        <CardChips label="어림 없음" tone="warn" list={checks.unestimated} note="옛 초안(블록 목록 전)이라 판면 어림이 없어 배정 쪽수로 셈" from={from} row={row} keyCls={key} />
      </section>

      <section aria-label="소항목" className="flex min-w-0 flex-col px-2 py-2">
        <h2 className="flex items-center justify-between px-2 py-1 text-xs font-bold text-navy" title={`조판 높이 = 판면 어림에서 앞 소항목과 같은 머리를 뺀 값 · 배정과 견줌 ${Math.round(FIT_BAND.under * 100)}~${Math.round(FIT_BAND.over * 100)}%`}>
          소항목 {sections.length}
          <span className="font-normal text-muted-2">배정 대비 · 쪽</span>
        </h2>
        <ol className="flex min-w-0 flex-col">
          {sections.map((s) => (
            <li key={s.cardId} className="flex min-w-0 items-center gap-0.5">
              <a
                href={`#bz-${s.uid}`}
                title={`${s.taskNo} ${s.title}\n${heads[s.head]} · 배정 ${pagesLabel(s.pages)} · ${s.source === "assigned" ? "조판 높이는 배정만큼(초안·어림 없음)" : `조판 ${s.height}mm(머리 모두 ${s.fullHeight}mm)`} — 누르면 그 쪽으로`}
                className="flex min-w-0 grow items-center gap-2 rounded px-2 py-1 no-underline hover:bg-row-hover"
              >
                <span className="w-9 shrink-0 font-mono text-xs font-semibold text-navy">{s.taskNo}</span>
                <span className={`min-w-0 grow truncate ${s.drafted ? "text-ink" : "text-muted-2"}`}>{s.title}</span>
                {s.fit === "over" || s.fit === "under" ? (
                  <Tag tone={FIT_LABEL[s.fit][1]} title={FIT_LABEL[s.fit][0]}>
                    {s.delta > 0 ? "+" : ""}
                    {s.delta}mm
                  </Tag>
                ) : s.fit === "ok" ? (
                  <span className="shrink-0 text-xs text-navy">맞음</span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-2">{s.drafted ? "어림 없음" : "초안 없음"}</span>
                )}
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-2">{s.startPage === s.endPage ? s.startPage : `${s.startPage}~${s.endPage}`}</span>
              </a>
              <WriteLink uid={s.uid} title={s.title} from={from} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** 과제 칩 한 줄(많으면 앞 8개 + 「외 n」 접기) */
function CardChips({ label, tone, list, note, from, row, keyCls }: { label: string; tone: Tone; list: Array<{ uid: string; taskNo: string; title: string; note?: string }>; note?: string; from: string; row: string; keyCls: string }) {
  if (!list.length) return null;
  const chip = (c: (typeof list)[number]) => (
    <Link key={c.uid} href={withReturn(`/reports/cards/${c.uid}`, from)} title={`${c.title}${c.note ? ` · ${c.note}` : ""} — 작성 화면`} className="no-underline">
      <Tag tone={tone}>{c.taskNo}</Tag>
    </Link>
  );
  return (
    <div className={row}>
      <span className={keyCls} title={note}>
        {label} {list.length}
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {list.slice(0, 8).map(chip)}
        {list.length > 8 && (
          <details className="group w-full">
            <summary className="w-fit cursor-pointer list-none text-xs leading-5 font-semibold text-link hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">외 {list.length - 8} 더 보기</span>
              <span className="hidden group-open:inline">접기</span>
            </summary>
            <span className="mt-1 flex flex-wrap gap-1">{list.slice(8).map(chip)}</span>
          </details>
        )}
      </span>
    </div>
  );
}
