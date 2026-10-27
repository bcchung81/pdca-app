import type { Metadata } from "next";
import Link from "next/link";
import { CardBoard } from "../../../components/cards/card-board";
import { editionLabel } from "../../../components/cards/card-original";
import { CardWorkspace } from "../../../components/cards/card-workspace";
import { PageHeader, PreviewBanner, Screen } from "../../../components/ui/kit";
import { NextSteps } from "../../../components/ui/next-steps";
import { TeamPicker } from "../../../components/ui/team-picker";
import { requireUser } from "../../../lib/auth/dal.ts";
import { deptScope } from "../../../lib/auth/scope.ts";
import { boardHref, parseView } from "../../../lib/cards/board-view.ts";
import { myTodo } from "../../../lib/cards/my-todo.ts";
import { listCards } from "../../../lib/cards/queries.ts";
import { versionLabel, versionStates, workspaceData } from "../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { monthLabel } from "../../../lib/format.ts";
import { receivedInspections } from "../../../lib/inspections/queries.ts";
import { loadSubmitCards } from "../../../lib/reports/queries.ts";
import { boardUnits } from "../../../lib/tracks/board-units.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "내 과제 · 경영평가 Sherpa" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * 내 과제. 보이는 과제는 역할이 정함 — 부서 담당자는 자기에게 지정된 과제(card_assignees)만, 성과관리팀·관리자는 모든 과제(읽기 전용, ?team=으로 부서를 좁힘).
 * 부서 담당자는 카드를 열어 이달 실적을 반영(작성본)하고 직접 확정(원장 반영)
 */
export default async function MyTasksPage({ searchParams }: PageProps<"/my">) {
  const user = await requireUser("/my");
  const staff = user.role !== "dept_user";
  const sp = await searchParams;
  const scope = await deptScope(user, sp);
  const track = await getTrack();
  const UNITS = boardUnits(track);
  const period = currentPeriod();
  const view = parseView(sp, staff ? UNITS.map((u) => u.id) : []);
  const peekUid = one(sp.peek);
  const base = { path: "/my", keep: staff && scope.team ? { team: String(scope.team.id) } : undefined };
  const supabase = await createClient();
  // 「N월에 할 일」 띠 재료(부서가 정해졌을 때만): 점검·초안은 행선 화면(/my/inspections·/my/report)과 같은 조회
  const team = scope.team;
  const [rows, ws, versions, received, submitCards] = await Promise.all([
    staff ? listCards({ teamId: scope.team?.id, track }) : listCards({ assigneeId: user.id, track }),
    peekUid ? workspaceData(user, peekUid, { preview: staff }) : null,
    versionStates(supabase, period),
    team ? receivedInspections(supabase, team.id) : [],
    team ? loadSubmitCards(supabase, Number(period.slice(0, 4)), { teamId: team.id, track }) : null,
  ]);
  const drafts: Record<string, string> = {};
  for (const r of rows) {
    const label = versionLabel(versions.get(r.id));
    if (label) drafts[r.uid] = label;
  }
  const todo = rows.filter((r) => !versions.get(r.id)).length;
  const closeHref = boardHref(view, undefined, base);

  // 띠는 부서 담당자(팀·과제 있음)와 부서를 고른 부서 화면 보기에만 — 「전체 부서」 보기에서는 숨김. 셈은 lib/cards/my-todo.ts
  const band = team && submitCards && rows.length ? myTodo({ period, track, rows, versions, inspections: received, drafts: [...submitCards.values()].flat() }) : null;
  const deptHref = (path: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(base.keep);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  const toAckHref = deptHref("/my/inspections", { status: "sent" });
  // 부서 화면 보기(읽기 전용)는 실제 담당자의 실행처럼 보이지 않게 「보기」 이름으로(핸드오프 7.3)
  const a = band?.action;
  const bandAction = !a
    ? null
    : "uid" in a
      ? {
          href: boardHref(view, a.uid, base),
          label: staff ? `${a.taskNo} 카드 보기` : a.label,
          title: a.kind === "returned" ? `돌려받은 ${a.taskNo} 작성본을 열어 보완합니다` : a.kind === "start" ? `${a.taskNo} 카드를 열어 ${monthLabel(period)} 실적을 작성본에 반영합니다` : `${a.taskNo} 작성본을 열어 이어서 고치고 제출합니다`,
        }
      : a.kind === "inspect"
        ? { href: toAckHref, label: staff ? "점검 결과 보기" : a.label, title: "확인할 점검 결과 목록을 엽니다" }
        : { href: deptHref("/my/report"), label: staff ? "경평 초안 보기" : a.label, title: "초안 없는 과제가 있는 경평 초안 화면을 엽니다" };
  const stepHref = (key: string, done: boolean) => (key === "inspect" ? (done ? deptHref("/my/inspections") : toAckHref) : key === "draft" ? deptHref("/my/report") : undefined);

  const peek =
    peekUid &&
    (ws ? (
      <CardWorkspace
        key={ws.mountKey}
        variant="peek"
        initialPanes={one(sp.panes) || undefined}
        uid={ws.card.uid}
        group={String(ws.card.data.group ?? "")}
        taskNo={ws.card.taskNo}
        title={ws.card.title}
        editionLabel={editionLabel(ws.card.edition)}
        initial={ws.initial}
        imageUrls={ws.card.imageUrls}
        layout={ws.card.layout}
        readOnly={ws.readOnly}
        locked={ws.locked}
        versionId={ws.openVersionId}
        rev={ws.rev}
        notice={ws.notice}
        draft={ws.draft}
        preview={staff}
        closeHref={closeHref}
        pageHref={withReturn(`/cards/${ws.card.uid}${staff && scope.team ? `?team=${scope.team.id}` : ""}`, boardHref(view, ws.card.uid, base))}
        defaultPeriod={monthLabel(period)}
      />
    ) : (
      <aside aria-label="과제관리카드 원문" className="peek-sheet w-full max-w-[480px] border-l border-line-strong bg-paper p-6 text-sm text-muted-2">
        이 카드를 볼 수 없습니다.{" "}
        <Link href={closeHref} className="text-link underline">
          목록으로
        </Link>
      </aside>
    ));

  return (
    <Screen header={<PageHeader title="내 과제" />} peek={peek || undefined}>
      {staff && (
        <PreviewBanner teamName={scope.team?.name ?? null} all>
          <span className="ml-auto">
            <TeamPicker teams={scope.teams} value={scope.team?.id ?? null} allLabel="전체 부서" />
          </span>
        </PreviewBanner>
      )}
      {band && <NextSteps id="my-todo" title={band.title} steps={band.steps.map((s) => ({ ...s, href: stepHref(s.key, s.tone === "done") }))} action={bandAction} empty="지금 처리할 일이 없습니다" />}
      <CardBoard
        rows={rows}
        staff={false}
        units={staff ? UNITS : []}
        selectedUid={ws?.card.uid}
        teamLabel={scope.team?.name ?? null}
        initialView={view}
        base={base}
        drafts={drafts}
        draftLink
        emptyNote={staff ? undefined : user.team ? "지정된 담당 과제가 없습니다 — 성과관리팀이 「사용자」 화면에서 담당 과제를 지정하면 여기에 보입니다" : "부서가 지정되지 않았습니다 — 관리자가 지정하면 과제가 보입니다"}
        note={!band && rows.length ? (todo ? `${monthLabel(period)} 실적 반영 전 ${todo}개` : `${monthLabel(period)} 작성본 모두 시작함`) : undefined}
      />
    </Screen>
  );
}
