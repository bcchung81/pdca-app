import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftWorkspace } from "../../../../../components/reports/draft-workspace";
import { requireUser } from "../../../../../lib/auth/dal.ts";
import { deptScope } from "../../../../../lib/auth/scope.ts";
import { currentPeriod } from "../../../../../lib/cards/view.ts";
import { isMgmtCard } from "../../../../../lib/cards/mgmt-card.ts";
import { fmtDateTime } from "../../../../../lib/format.ts";
import { returnTarget, safeReturn, withReturn } from "../../../../../lib/nav/return-to.ts";
import { blockShapeCode, shapeMenu, shapeRules } from "../../../../../lib/reports/block-shape.ts";
import { planMatch, readComposition } from "../../../../../lib/reports/composition.ts";
import { LENS_LABEL } from "../../../../../lib/reports/lens.ts";
import { readSection } from "../../../../../lib/reports/section.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";
import { cardCommentsOf, cardRefs, checkNeedsOf, draftMetaOf, menuOf, neighborsOf, outlineDataOf, priorChoices, sourceFilesOf, usedOf } from "./derive.ts";
import { loadCard, loadReportCardData } from "./load.ts";
import { ReportCheck } from "./report-card-check";
import { ReportCardPreview } from "./report-card-preview";
import { ReportToolbar, ReportToolbarEnd } from "./report-card-toolbar";

export const metadata: Metadata = { title: "과제별 초안 · 경평 초안 · 경영평가 Sherpa" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

/**
 * 경평 초안 · 과제별 초안(카드 1장 → 평가내용2 소항목). 한 해 동안 고친 과제관리카드(원장)와 고른 첨부 자료(카드 전용 자료·그 보고서
 * 추가자료)로 2025년도 경영실적보고서 최종본 양식의 소항목 초안을 만들고 봅니다. 원장 편집·AI 작성지원 같은 원장 기능은 두지 않습니다.
 * 그 카드를 볼 수 있는 사람은 보고(RLS), 고칠 수 있는 사람(부서는 자기 부서 카드)은 만듭니다.
 * 화면은 과제원장 전체 페이지와 같은 짜임(늘 전체 보기 — 좌측 메뉴 없음): 머리 한 줄 → 왼쪽 도구줄 + 보고서 미리보기, 오른쪽 「AI 초안 | 점검 결과」 탭과
 * 머리 폴더 단추로 바꿔 여는 「근거 자료」(components/reports/draft-workspace.tsx).
 * ?from은 연 목록으로 돌아갈 주소(머리 오른쪽 위 목록 아이콘) — 앞뒤 과제(‹ ›)는 같은 from을 이어받고, 다른 화면으로 가는 더보기 메뉴는 이 화면 주소로 되돌아옵니다.
 * 성과관리팀·관리자가 ?team=으로 오면 부서 화면 보기(읽기 전용 — 부서 경평 초안 /my/report?team=에서 들어옴): 팀을 못 찾아도 읽기 전용으로 둡니다.
 * 조회는 load.ts, 파생 값은 derive.ts, 도구줄·점검 결과·미리보기는 report-card-*.tsx에 있고 이 파일은 권한·부서 화면 보기 판단과 조립만 합니다.
 */
export default async function ReportCardPage({ params, searchParams }: PageProps<"/reports/cards/[uid]">) {
  const { uid } = await params;
  const sp = await searchParams;
  const from = safeReturn(sp.from);
  const me = await requireUser(`/reports/cards/${uid}`);
  const staff = me.role !== "dept_user";
  // 부서 화면 보기(deptView — 아래 preview는 초안 미리보기 노드라 이름을 달리 둠): ?team=이 있으면 팀을 못 찾아도 읽기 전용(fail-closed)
  const teamParam = (Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "";
  const scope = staff && teamParam ? await deptScope(me, sp) : null;
  const deptView = Boolean(scope);
  const viewTeam = scope?.team ?? null;
  // 부서 화면 보기에서 이어지는 링크에 붙일 쿼리(카드·과제별 초안·보고서 검토도 읽기 전용으로 열림)
  const teamQ = deptView ? `team=${encodeURIComponent(teamParam)}` : "";
  const teamQs = teamQ ? `?${teamQ}` : "";
  // 성과관리팀 화면 그대로(부서 화면 보기면 부서 담당자처럼 — 앞뒤 과제는 그 부서 안에서 과제번호 순)
  const staffView = staff && !deptView;
  const supabase = await createClient();
  const card = await loadCard(supabase, uid);
  if (!card) notFound();
  // 경영관리 카드(2026-10-09 R3): 평가내용 → 대주제 → 절 — 구성안부터(바로 만들기 없음), 판면 어림·사업 조판 없음, 전년 절은 구성안이 평가내용으로 고름
  const mg = isMgmtCard(card.data);
  const year = Number(currentPeriod().slice(0, 4));
  const { draft, report, matRows, sibs, outlineSort, locked, priorSections, lens, inspectionLabel, signed, reportMats, comments } = await loadReportCardData(supabase, card, { year, staff, staffView });
  const prior = priorChoices(card.data, priorSections);
  const { cardFiles, reportFiles } = sourceFilesOf({ matRows, signed, report, reportMats }, card.id);

  const spec = readSection(draft?.spec);
  // 구성안(재료표·짜임 — 담당자가 보고 고친 뒤 승인하면 그 짜임대로 집필)
  const composition = readComposition(draft?.outline);
  const outlineModule = composition?.module ?? spec?.module ?? 1;
  const own = !staff && card.team_id === me.team?.id;
  const canWrite = card.status === "active" && (staff || own) && !locked && !deptView;
  const stale = Boolean(draft && draft.source_rev !== null && draft.source_rev !== card.data_rev);
  const warnings: string[] = Array.isArray(draft?.warnings) ? draft.warnings.map(String) : [];
  const unknown: string[] = draft?.unknown_numbers ?? [];
  const { unit, team } = cardRefs(card);
  const back = returnTarget(sp.from, staffView ? "/reports/cards" : viewTeam ? `/my/report?team=${viewTeam.id}` : "/my/report");
  const { prev, next } = neighborsOf(sibs, outlineSort, staffView, uid);

  // 앞뒤 과제(‹ ›)는 지금 받은 from을 그대로 이어받아(같은 목록으로 돌아감), 다른 화면으로 가는 메뉴는 이 초안 화면 주소로 돌아옴
  const self = (u: string) => withReturn(`/reports/cards/${u}${teamQs}`, from);
  // 머리 글: 주요사업은 묶음 이름(주요사업N), 경영관리는 지표명(묶음 id 경영관리N은 식별자라 화면 글자로 쓰지 않음)
  const group = mg ? (unit?.name ?? card.eval_unit_id) : (unit?.card_group ?? card.eval_unit_id);
  const menu = menuOf({ uid, teamQs, selfHref: `/reports/cards/${uid}${teamQs}`, reportId: report?.id ?? null, staffView, mg, evalUnitId: card.eval_unit_id, hasSpec: Boolean(spec) });

  // 「점검 결과」 탭의 채울 자료 건수가 작업 공간 탭 표지에도 쓰임
  const needs = checkNeedsOf(spec, card.data, report);
  const needCount = needs.draftNeeds.length + needs.kpiNeeds.length + needs.figureNeeds.length;
  const checkCount = needCount + warnings.length;
  const kpiHref = own ? "/my/report" : report && staff ? `/reports/${report.id}${teamQs}` : null;

  // 과제원장 전체 페이지처럼 늘 전체 보기(좌측 메뉴·화면 탭 없음 — lib/full-view.ts). 화면 상태(탭·근거 선택·요청)는 작업 공간 부품이 들고 있음
  return (
    <DraftWorkspace
      key={uid}
      uid={uid}
      title={card.title}
      taskNo={card.task_no}
      group={group}
      place={mg ? `${year}년도 경영실적보고서(경영관리) · ${group} · ${team?.name ?? ""}` : `${year}년도 경영실적보고서 · ${group} ${unit?.name ?? ""} · ${team?.name ?? ""}`}
      back={back}
      prev={prev ? { href: self(prev.uid), taskNo: prev.task_no, title: prev.title } : null}
      next={next ? { href: self(next.uid), taskNo: next.task_no, title: next.title } : null}
      menu={menu}
      canWrite={canWrite}
      locked={locked}
      hasSpec={Boolean(spec)}
      draftInfo={spec ? `${draft?.model ?? "AI"} · ${fmtDateTime(draft?.updated_at)}` : null}
      draftMeta={draftMetaOf({ uid, spec, draft, hasOutline: Boolean(composition), stale, need: needCount, warn: warnings.length, staff, deptView, teamQs, report })}
      toolbar={<ReportToolbar spec={spec} draft={draft} composition={composition} stale={stale} unknown={unknown} />}
      toolbarEnd={<ReportToolbarEnd uid={uid} spec={spec} canWrite={canWrite} />}
      preview={<ReportCardPreview spec={spec} unknown={unknown} weak={needs.weakSentences} canWrite={canWrite} hasOutline={Boolean(composition)} />}
      outline={outlineDataOf(composition, draft, spec, outlineModule)}
      match={composition ? planMatch(composition, spec?.blocks ?? []) : []}
      // 처음 볼 판(2026-09-28 사용자 요구): 초안이 있으면 늘 초안, 초안 없이 구성안만 있으면 구성안 판면
      defaultView={spec ? "draft" : composition ? "outline" : "draft"}
      check={<ReportCheck spec={spec} needs={needs} cardComments={cardCommentsOf(comments, uid)} warnings={warnings} year={year} own={own} kpiHref={kpiHref} />}
      checkCount={checkCount}
      version={spec && spec.version === 3 && spec.blocks?.length && draft?.updated_at ? String(draft.updated_at) : null}
      humanEdits={spec?.humanEdits ?? []}
      mg={mg}
      // 「다른 모양으로」(2026-10-12): 고칠 수 있는 블록 목록 초안만. 근거 조건은 구성안이 있으면 그 재료로 미리 표시(없으면 요청 때 서버가 봄)
      shapeMenu={canWrite && spec?.version === 3 && spec.blocks?.length ? shapeMenu(mg, composition ? shapeRules(mg, composition) : null) : undefined}
      blockCodes={spec?.blocks?.map(blockShapeCode)}
      cardFiles={cardFiles}
      reportFiles={reportFiles}
      used={usedOf(spec, draft)}
      reportHref={own ? "/my/report" : deptView ? `/my/report${teamQs}` : null}
      deptView={deptView}
      prior={{ options: prior.options, initial: Array.isArray(spec?.priorKeys) ? spec.priorKeys : prior.auto, auto: prior.auto }}
      lens={lens.map((x) => ({ group: LENS_LABEL[x.group], title: x.title }))}
      inspection={inspectionLabel}
    />
  );
}
