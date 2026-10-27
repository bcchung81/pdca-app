import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editionLabel } from "../../../../components/cards/card-original";
import { CardWorkspace } from "../../../../components/cards/card-workspace";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { deptScope } from "../../../../lib/auth/scope.ts";
import { workspaceData } from "../../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { monthLabel } from "../../../../lib/format.ts";
import { returnTarget } from "../../../../lib/nav/return-to.ts";

export const metadata: Metadata = { title: "과제관리카드 원문 · 경영AI비서" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * 카드 전체 쪽. 성과관리팀은 원장 편집, 부서 담당자는 이달 작성본 편집.
 * 성과관리팀·관리자가 ?team=으로 오면 그 부서 담당자에게 보이는 그대로(읽기 전용 부서 화면 보기).
 * ?from은 연 화면으로 돌아갈 주소(목록 아이콘·닫기), ?panes는 처음 열 오른쪽 패널(점검 결과에서 「카드 열어 보완」 등)
 */
export default async function CardPage({ params, searchParams }: PageProps<"/cards/[uid]">) {
  const { uid } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/cards/${uid}`);
  const dept = user.role === "dept_user";
  // 부서 화면 보기는 ?team=이 있을 때만 판정(그 밖의 성과관리팀·관리자 방문마다 부서 목록을 조회하지 않게)
  const teamParam = one(sp.team);
  const scope = !dept && teamParam ? await deptScope(user, sp) : null;
  // ?team=이 있으면 팀을 못 찾아도(잘못된 id·트랙을 바꿔 그 트랙에 과제가 없는 팀) 읽기 전용 — 원장 편집이 열리지 않게(저장은 Referer로 어차피 거절됨)
  const preview = Boolean(scope);
  const previewTeam = scope?.team ?? null;
  const ws = await workspaceData(user, uid, { preview });
  if (!ws) notFound();
  const defaultClose = dept ? `/my?peek=${ws.card.uid}` : preview ? (previewTeam ? `/my?team=${previewTeam.id}&peek=${ws.card.uid}` : "/my") : `/cards?peek=${ws.card.uid}`;
  const target = returnTarget(sp.from, defaultClose);
  return (
    <CardWorkspace
      key={ws.mountKey}
      variant="page"
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
      fixedLockedAt={dept || preview ? undefined : ws.card.fixedLockedAt}
      draft={ws.draft}
      review={ws.review}
      preview={preview}
      initialPanes={one(sp.panes) || undefined}
      closeHref={target.href}
      returnLabel={target.label}
      defaultPeriod={monthLabel(currentPeriod())}
    />
  );
}
