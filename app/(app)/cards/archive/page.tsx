import type { Metadata } from "next";
import { ArchiveRowActions } from "../../../../components/cards/archive-controls";
import { Empty, NoAccess, PageHeader, Panel, Screen, T } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { fmtDateTime } from "../../../../lib/format.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "보관함 · 경영평가 Sherpa" };

/** 과제 원장 · 보관함: 삭제(보관)한 과제. 되살리기(성과관리팀), 영구 삭제(관리자) */
export default async function ArchivePage() {
  const me = await requireAtLeast("pmo", "/cards/archive");
  if (!me) return <NoAccess title="보관함" need="성과관리팀" />;
  const supabase = await createClient();
  const [{ data: rows }, { data: people }] = await Promise.all([
    supabase.from("cards").select("id, uid, task_no, title, hq, retired_at, retired_by, retired_reason, team:teams(name)").eq("status", "retired").order("retired_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || "—"]));
  const list = rows ?? [];
  const teamName = (t: unknown) => (Array.isArray(t) ? t[0]?.name : (t as { name?: string } | null)?.name) ?? "";

  return (
    <Screen header={<PageHeader title="보관함" />}>
      <Panel title={`보관한 과제 ${list.length}개`}>
        {list.length === 0 ? (
          <Empty title="보관한 과제가 없습니다.">과제 원장에서 카드를 열고 더보기(…)의 「과제 삭제(보관)」를 누르면 여기로 옮겨집니다.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[980px]`}>
              <colgroup>
                <col className="w-[120px]" />
                <col />
                <col className="w-[150px]" />
                <col className="w-[132px]" />
                <col className="w-[200px]" />
                <col className="w-[230px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["과제", "과제명", "부서", "보관한 때", "까닭", ""].map((h, i) => (
                    <th key={i} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className={T.row}>
                    <td className={`${T.td} truncate font-mono text-ui text-navy`} title={c.id}>
                      {c.id}
                    </td>
                    <td className={`${T.td} truncate`} title={c.title}>
                      {c.title}
                    </td>
                    <td className={`${T.td} truncate text-muted-2`}>{teamName(c.team) || c.hq || "—"}</td>
                    <td className={`${T.td} font-mono text-ui text-muted-2`} title={who.get(c.retired_by ?? "") ?? ""}>
                      {c.retired_at ? fmtDateTime(c.retired_at) : "—"}
                    </td>
                    <td className={`${T.td} truncate text-ui`} title={c.retired_reason ?? ""}>
                      {c.retired_reason ?? "—"}
                    </td>
                    <td className={T.td}>
                      <ArchiveRowActions uid={c.uid} taskNo={c.task_no} canPurge={me.role === "admin"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Screen>
  );
}
