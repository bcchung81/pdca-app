import { LayoutPanelTop } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UnitPartsWorkspace } from "../../../../../../components/reports/unit-parts-workspace";
import { TrackNotReady } from "../../../../../../components/shell/track-gate";
import { Empty, NoAccess, PageHeader, Panel, Screen, T, Tag } from "../../../../../../components/ui/kit";
import { ListIconButton } from "../../../../../../components/workspace/list-icon-button";
import { requireAtLeast } from "../../../../../../lib/auth/dal.ts";
import { returnTarget } from "../../../../../../lib/nav/return-to.ts";
import { REPORT_CSS, UNIT_PARTS_CSS } from "../../../../../../lib/reports/section-css.ts";
import { unitPartsHtml } from "../../../../../../lib/reports/unit-parts-html.ts";
import { kpiRate, unitPartsNeeds } from "../../../../../../lib/reports/unit-parts-mg.ts";
import { createClient } from "../../../../../../lib/supabase/server.ts";
import { loadUnitParts } from "./actions";

export const metadata: Metadata = { title: "카드 밖 부분 · 경평 초안 · 경평AI비서" };

const PART_NAME = { cover: "표지", findings: "지적", prior: "전년 대비", outcome: "성과분석" } as const;

/**
 * 성과관리팀 · 경평 초안 · 카드 밖 부분(경영관리 지표 하나의 표지·지적사항 조치실적·전년 대비 주요 추진실적·성과분석 및 환류 — R5b 화면, 설계
 * docs/plan/경영관리-R5-지표단위-설계.md §3.5). 왼쪽 미리보기 종이 + 오른쪽 부분 탭(components/reports/unit-parts-workspace.tsx), 데이터는 서버 액션
 * loadUnitParts(로그인 사용자 권한 — RLS)가 읽음. 경영관리 지표가 아니면(주요사업) 같은 틀의 「준비 중」. 사업 조판의 머리 아이콘으로 들어오고
 * ?from은 연 곳으로 돌아갈 주소(머리 목록 아이콘, 기본은 그 지표 사업 조판). AI 문장 채우기는 R5c.
 */
export default async function UnitPartsPage({ params, searchParams }: PageProps<"/reports/business/[unit]/parts">) {
  const { unit } = await params;
  const sp = await searchParams;
  const here = `/reports/business/${encodeURIComponent(unit)}/parts`;
  const me = await requireAtLeast("pmo", here);
  if (!me) return <NoAccess title="경평 초안 · 카드 밖 부분" need="성과관리팀" />;
  const supabase = await createClient();
  const { data: u } = await supabase.from("eval_units").select("id, name, track").eq("id", unit).maybeSingle();
  if (!u) notFound();
  // 주요사업의 「사업 공통 부분」은 뒤 일(설계 Q10) — 이 화면은 경영관리 지표만
  if (u.track !== "경영관리") return <TrackNotReady title="경평 초안" screen="카드 밖 부분" track="주요사업" />;

  const layoutHref = `/reports/business/${encodeURIComponent(unit)}`;
  const back = returnTarget(sp.from, layoutHref);
  const r = await loadUnitParts(unit);
  const icons = (
    <div className="flex shrink-0 items-center gap-2">
      <ListIconButton href={back.href} label={back.label} />
      <Link href={layoutHref} aria-label="사업 조판" title="사업 조판 — 이 지표의 과제별 초안을 쪽에 이어 붙여 보기" className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}>
        <LayoutPanelTop size={16} aria-hidden />
      </Link>
    </div>
  );
  if (!r.ok) {
    return (
      <Screen header={<PageHeader title={u.name}>{icons}</PageHeader>}>
        <Panel>
          <Empty title={r.message} />
        </Panel>
      </Screen>
    );
  }

  // 지표 완성 점검 요약(머리 칩): 부분별 저장·확정, 남은 【확인】, 미반영 지적
  const total = r.parts.length;
  const saved = r.parts.filter((p) => p.saved).length;
  const confirmed = r.parts.filter((p) => p.saved && p.status === "confirmed").length;
  const needs = unitPartsNeeds(r.view);
  const unmatched = r.view.findings?.code.unmatched.length ?? 0;
  const state = r.parts.map((p) => `${PART_NAME[p.part]} ${p.saved ? (p.status === "confirmed" ? "확정" : "초안") : "저장 전"}`).join(" · ");
  const rates: Record<string, { up: string; down: string }> = {};
  for (const k of r.view.outcome?.kpi ?? []) rates[k.id] = { up: kpiRate({ code: k.code, human: { ...k.human, polarity: "up" } }).text, down: kpiRate({ code: k.code, human: { ...k.human, polarity: "down" } }).text };

  return (
    <Screen
      header={
        <PageHeader title={r.indicator}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Tag tone={saved === total ? "link" : "muted"} title={state}>
              저장 {saved}/{total}
            </Tag>
            <Tag tone={confirmed === total ? "solid" : "muted"} title={state}>
              확정 {confirmed}/{total}
            </Tag>
            {needs > 0 && (
              <Tag tone="warn" title="부분 글에 남은 【확인: …】 자리표시(올해 값이 근거에 없던 곳)">
                【확인】 {needs}
              </Tag>
            )}
            {unmatched > 0 && (
              <Tag tone="warn" title="어느 카드 지적 행과도 짝지어지지 않은 ’25 평가위원 지적 — 지적 탭에서 확인">
                미반영 지적 {unmatched}
              </Tag>
            )}
          </div>
          {icons}
        </PageHeader>
      }
    >
      <UnitPartsWorkspace
        unit={unit}
        canWrite={r.canWrite}
        canConfirm={r.canConfirm}
        parts={r.parts}
        html={unitPartsHtml(r.view, { marks: true })}
        css={REPORT_CSS + UNIT_PARTS_CSS}
        rates={rates}
        uids={r.uids}
        warnings={r.warnings}
        from={`${here}${back.href !== layoutHref ? `?from=${encodeURIComponent(back.href)}` : ""}`}
      />
    </Screen>
  );
}
