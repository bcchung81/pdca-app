import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CardBoard } from "../../../components/cards/card-board";
import { editionLabel } from "../../../components/cards/card-original";
import { CardWorkspace } from "../../../components/cards/card-workspace";
import { PageHeader, Screen } from "../../../components/ui/kit";
import { requireUser } from "../../../lib/auth/dal.ts";
import { type BoardBase, boardHref, parseView } from "../../../lib/cards/board-view.ts";
import { fixedLabelOfTrack } from "../../../lib/cards/fixed.ts";
import { listCards } from "../../../lib/cards/queries.ts";
import { versionLabel, versionStates, workspaceData } from "../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { monthLabel } from "../../../lib/format.ts";
import { boardUnits } from "../../../lib/tracks/board-units.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "과제 원장 · 경영평가 Sherpa" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** 과제 원장(성과관리팀·관리자): 카드 59장 목록 + 옆 창에서 바로 편집, 제출된 작성본 확정 */
export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const user = await requireUser("/cards");
  const sp = await searchParams;
  if (user.role === "dept_user") {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/my${qs.size ? `?${qs}` : ""}`);
  }
  const peekUid = one(sp.peek);
  // 트랙: 머리띠 전환(쿠키)이 정함 — 주요사업은 사업 3개, 경영관리는 지표 14개가 평가단위 칩
  const track = await getTrack();
  const units = boardUnits(track);
  const base: BoardBase = { path: "/cards", keep: {} };
  const view = parseView(sp, units.map((u) => u.id));
  const period = currentPeriod();
  const supabase = await createClient();
  const [rows, ws, versions, { count: fixedCount }, { count: archived }] = await Promise.all([
    listCards({ track }),
    peekUid ? workspaceData(user, peekUid, { preview: false }) : null,
    versionStates(supabase, period),
    supabase.from("cards").select("id, unit:eval_units!inner(track)", { count: "exact", head: true }).eq("status", "active").eq("unit.track", track).not("fixed_locked_at", "is", null),
    supabase.from("cards").select("id, unit:eval_units!inner(track)", { count: "exact", head: true }).eq("status", "retired").eq("unit.track", track),
  ]);
  // 과제명 옆 칩: 이달 작성본 상태(작성 중·돌려받음·제출·확정)
  const drafts: Record<string, string> = {};
  for (const r of rows) {
    const label = versionLabel(versions.get(r.id));
    if (label) drafts[r.uid] = label;
  }
  const submitted = [...versions.values()].filter((v) => v.status === "submitted").length;

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
        notice={ws.notice}
        rev={ws.rev}
        fixedLockedAt={ws.card.fixedLockedAt}
        review={ws.review}
        closeHref={boardHref(view, undefined, base)}
        pageHref={withReturn(`/cards/${ws.card.uid}`, boardHref(view, ws.card.uid, base))}
        defaultPeriod={monthLabel(period)}
      />
    ) : (
      <aside aria-label="과제관리카드 원문" className="peek-sheet w-full max-w-[480px] border-l border-line-strong bg-paper p-6 text-sm text-muted-2">
        이 카드를 볼 수 없습니다.{" "}
        <Link href={boardHref(view, undefined, base)} className="text-link underline">
          목록으로
        </Link>
      </aside>
    ));

  return (
    <Screen
      header={
        <PageHeader title="과제 원장" />
      }
      peek={peek || undefined}
    >
      <CardBoard
        rows={rows}
        staff
        base={base}
        allLabel={track === "경영관리" ? "경영관리 전체" : undefined}
        units={units}
        selectedUid={ws?.card.uid}
        teamLabel={null}
        initialView={view}
        drafts={drafts}
        note={submitted ? `${monthLabel(period)} 작성본 ${submitted}건 확정 대기` : undefined}
        fixed={{ locked: fixedCount ?? 0, total: rows.length, exportHref: "/cards/export", label: fixedLabelOfTrack(track) }}
        archived={archived ?? 0}
      />
    </Screen>
  );
}
