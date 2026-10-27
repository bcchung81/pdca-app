import type { Metadata } from "next";
import Link from "next/link";
import { ImportUploader } from "../../../../components/cards/import/import-controls";
import { Empty, NoAccess, PageHeader, Panel, Screen, T, Tag } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { fmtDateTime } from "../../../../lib/format.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import type { ImportFileMeta } from "./actions";

export const metadata: Metadata = { title: "카드 현행화 · 경평AI비서" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

/** 성과관리팀 · 카드 현행화: 부서가 보낸 한글 파일로 원장을 최신으로(지침 14 현행화 모드) */
export default async function CardImportPage() {
  const me = await requireAtLeast("pmo", "/cards/import");
  if (!me) return <NoAccess title="카드 현행화" need="성과관리팀" />;
  const supabase = await createClient();
  const [{ data: imports }, { data: items }, { data: people }] = await Promise.all([
    supabase.from("card_imports").select("id, scope, target_card_id, files, status, created_by, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("card_import_items").select("import_id, status, match"),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || "—"]));
  const tally = new Map<number, { total: number; applied: number; skipped: number; pending: number; none: number }>();
  for (const it of items ?? []) {
    const t = tally.get(it.import_id) ?? { total: 0, applied: 0, skipped: 0, pending: 0, none: 0 };
    t.total += 1;
    if (it.status === "applied") t.applied += 1;
    else if (it.status === "skipped") t.skipped += 1;
    else if (it.status === "pending") t.pending += 1;
    if (it.match === "none" && it.status === "pending") t.none += 1;
    tally.set(it.import_id, t);
  }
  const list = imports ?? [];

  return (
    <Screen header={<PageHeader title="카드 현행화" />}>
      <Panel title="한글 파일 올리기">
        <div className="p-5">
          <ImportUploader />
        </div>
      </Panel>

      <Panel title="현행화 기록" aside={list.length ? `최근 ${list.length}건` : undefined}>
        {list.length === 0 ? (
          <Empty title="아직 현행화한 파일이 없습니다.">위에서 한글 파일을 올리면 여기에 묶음별로 쌓입니다.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[880px]`}>
              <colgroup>
                <col className="w-[132px]" />
                <col className="w-[120px]" />
                <col />
                <col className="w-[88px]" />
                <col className="w-[240px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["올린 때", "올린 사람", "파일", "카드", "처리"].map((h) => (
                    <th key={h} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((imp) => {
                  const files = (imp.files ?? []) as ImportFileMeta[];
                  const t = tally.get(imp.id) ?? { total: 0, applied: 0, skipped: 0, pending: 0, none: 0 };
                  const names = files.map((f) => f.name).join(", ");
                  return (
                    <tr key={imp.id} className={T.row}>
                      <td className={`${T.td} font-mono text-ui text-muted-2`}>{fmtDateTime(imp.created_at)}</td>
                      <td className={`${T.td} truncate`}>{who.get(imp.created_by) ?? "—"}</td>
                      <td className={`${T.td} truncate`} title={names}>
                        <Link href={`/cards/import/${imp.id}`} className="font-semibold text-navy no-underline hover:underline">
                          {files.length > 1 ? `${files[0]?.name} 외 ${files.length - 1}개` : (files[0]?.name ?? "—")}
                        </Link>
                        {imp.scope === "draft" && <span className="ml-2 text-xs text-muted">부서 작성본</span>}
                        {files.some((f) => f.error) && <span className="ml-2 text-xs text-warn">읽기 실패 {files.filter((f) => f.error).length}</span>}
                      </td>
                      <td className={`${T.td} font-mono text-ui`}>{imp.status === "uploading" ? "—" : t.total}</td>
                      <td className={T.td}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          {imp.status === "uploading" ? (
                            <Tag tone="warn">올리는 중·중단</Tag>
                          ) : (
                            <>
                              {t.applied > 0 && <Tag tone="navy">반영 {t.applied}</Tag>}
                              {t.pending > 0 && <Tag tone="warnSolid">대기 {t.pending}</Tag>}
                              {t.skipped > 0 && <Tag>건너뜀 {t.skipped}</Tag>}
                              {t.total === 0 && <Tag tone="warn">읽은 카드 없음</Tag>}
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Screen>
  );
}
