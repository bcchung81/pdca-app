import type { Metadata } from "next";
import Link from "next/link";
import { AckButton } from "../../../../components/inspections/ack-button";
import { InspectionView } from "../../../../components/inspections/inspection-view";
import { Empty, LinkTabs, PageHeader, Peek, PreviewBanner, Screen, T, Tag, Toolbar } from "../../../../components/ui/kit";
import { TeamPicker } from "../../../../components/ui/team-picker";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { deptScope } from "../../../../lib/auth/scope.ts";
import { fmtDate, monthLabel, periodLabel } from "../../../../lib/format.ts";
import { STATUS_LABEL, needsCount, readResult, tally } from "../../../../lib/inspections/model.ts";
import { receivedInspections } from "../../../../lib/inspections/queries.ts";
import { withReturn } from "../../../../lib/nav/return-to.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { trackOfUnit } from "../../../../lib/tracks/index.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "점검 결과 · 경평AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** 부서 담당자 · 점검 결과: 성과관리팀이 보낸 월간 점검표를 읽고 「확인」 → 카드에서 보완 */
export default async function MyInspectionsPage({ searchParams }: PageProps<"/my/inspections">) {
  const user = await requireUser("/my/inspections");
  const track = await getTrack();
  const sp = await searchParams;
  const scope = await deptScope(user, sp);
  const tab = one(sp.status);
  const peekId = Number(one(sp.peek)) || null;
  const supabase = await createClient();
  // 머리띠에서 고른 트랙의 과제 점검만(주요사업 점검표와 경영관리 점검표는 양식이 다름)
  const list = scope.team ? (await receivedInspections(supabase, scope.team.id)).filter((i) => trackOfUnit(i.card.evalUnitId) === track) : [];
  const teamQs = scope.preview && scope.team ? `team=${scope.team.id}` : "";
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams(teamQs);
    if (tab) p.set("status", tab);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/my/inspections?${s}` : "/my/inspections";
  };
  const tabHref = (status: string) => {
    const p = new URLSearchParams(teamQs);
    if (status) p.set("status", status);
    const s = p.toString();
    return s ? `/my/inspections?${s}` : "/my/inspections";
  };
  const shown = list.filter((i) => !tab || i.status === tab);
  const waiting = list.filter((i) => i.status === "sent").length;
  const peek = peekId ? list.find((i) => i.id === peekId) : undefined;
  // 카드 전체 페이지로: 오른쪽 패널을 「점검 결과」 탭으로 연 채(옆 탭 「AI 작성지원」), 부서 화면 보기면 ?team= 유지, 닫으면 이 점검 결과 화면으로 돌아감
  const cardHref = (uid: string) => {
    const p = new URLSearchParams();
    if (scope.preview && scope.team) p.set("team", String(scope.team.id));
    p.set("panes", "inspection");
    return withReturn(`/cards/${uid}?${p}`, href({ peek: String(peekId) }));
  };

  return (
    <Screen
      header={<PageHeader title="점검 결과" />}
      peek={
        peek && (
          <Peek
            label="점검 결과"
            eyebrow={`${peek.card.group} · ${peek.card.taskNo} · ${periodLabel(peek.period)} 점검`}
            title={peek.card.title}
            closeHref={href({})}
            width={680}
            actions={
              <>
                <Link href={cardHref(peek.card.uid)} className={T.btn}>
                  {scope.preview ? "카드 열기" : "카드 열어 보완"}
                </Link>
                {peek.status === "sent" && !scope.preview && <AckButton id={peek.id} />}
              </>
            }
          >
            <InspectionView result={readResult(peek.result)} date={peek.updatedAt} />
          </Peek>
        )
      }
    >
      {scope.preview && (
        <PreviewBanner teamName={scope.team?.name ?? null}>
          <span className="ml-auto">
            <TeamPicker teams={scope.teams} value={scope.team?.id ?? null} />
          </span>
        </PreviewBanner>
      )}
      <Toolbar>
        <LinkTabs
          label="확인 상태"
          tabs={[
            { href: tabHref(""), label: "전체", n: list.length, on: !tab },
            { href: tabHref("sent"), label: "확인할 것", n: waiting, on: tab === "sent" },
            { href: tabHref("acknowledged"), label: "확인함", n: list.length - waiting, on: tab === "acknowledged" },
          ]}
        />
        {scope.team && <span className="min-w-0 truncate text-xs text-muted-2">{scope.team.name}</span>}
      </Toolbar>
      <section aria-label="받은 점검" className={T.wrap}>
        {!scope.team ? (
          // 부서 화면 보기(성과관리팀·관리자)에서 아직 부서를 안 고름 ↔ 부서 담당자의 부서 미지정
          scope.preview ? (
            <Empty title="부서를 고르세요">위에서 부서를 고르면 그 부서 담당자가 받은 점검 결과가 보입니다.</Empty>
          ) : (
            <Empty title="부서가 지정되지 않았습니다">관리자가 지정하면 점검 결과가 보입니다.</Empty>
          )
        ) : shown.length === 0 ? (
          <Empty title={list.length ? "이 상태의 점검이 없습니다." : "아직 받은 점검 결과가 없습니다."} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[840px]`}>
              <colgroup>
                <col className="w-[88px]" />
                <col className="w-[76px]" />
                <col />
                <col className="w-[72px]" />
                <col className="w-[88px]" />
                <col className="w-[96px]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["기간", "번호", "과제명", "보완", "집중보완", "상태", "받은 날"].map((h) => (
                    <th key={h} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className={i.id === peekId ? T.rowOn : T.row}>
                    <td className={`${T.td} text-ui text-muted-2`}>{monthLabel(i.period)} 점검</td>
                    <td className={`${T.td} font-mono text-ui text-navy`}>{i.card.taskNo}</td>
                    <td className={`${T.td} truncate`}>
                      <Link href={href({ peek: String(i.id) })} scroll={false} title={i.card.title} className="block truncate font-semibold text-navy no-underline hover:underline">
                        {i.card.title}
                      </Link>
                    </td>
                    <td className={`${T.td} font-mono text-ui ${needsCount(readResult(i.result)) ? "text-warn" : "text-muted"}`}>{needsCount(readResult(i.result))}</td>
                    <td className={T.td}>{tally(readResult(i.result)).focus ? <Tag tone="warnSolid">집중</Tag> : <span className="text-muted">—</span>}</td>
                    <td className={T.td}>
                      <Tag tone={i.status === "sent" ? "link" : "navy"}>{i.status === "sent" ? "확인 필요" : STATUS_LABEL[i.status]}</Tag>
                    </td>
                    <td className={`${T.td} font-mono text-xs text-muted`}>{fmtDate(i.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Screen>
  );
}
