import type { Metadata } from "next";
import Link from "next/link";
import { DocDelete, LibraryUpload } from "../../../../components/admin/library-upload";
import { LinkTabs, NoAccess, PageHeader, Panel, Peek, Screen, T, Tag, Toolbar } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { fmtDate, fmtDateTime } from "../../../../lib/format.ts";
import { harnessSources } from "../../../../lib/harness/source-info.ts";
import { loadBundleChunks } from "../../../../lib/ai/context.ts";
import { sharedSizeReport } from "../../../../lib/knowledge/guard.ts";
import type { Check } from "../../../../lib/knowledge/types.ts";
import { UNIT_LABEL } from "../../../../lib/knowledge/labels.ts";
import { PEER_DOC_ID } from "../../../../lib/knowledge/parsers/peer.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "공통 자료·틀 · 경영AI비서" };
/** 일반 문서를 올릴 때 서버에서 읽고 나누는 시간(큰 PDF는 오래 걸릴 수 있어 함수 최대 시간을 명시) */
export const maxDuration = 300;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DOC_STATUS: Record<string, string> = { deferred: "보류", retired: "대체됨" };
/** 화면에서 올린 일반 문서(id up-…)와 붙임2만 화면에서 지울 수 있음 */
const UPLOADED_ID = /^up-[0-9a-f]{8}$/;

/** 관리자 · 공통 자료·틀: 올리기 칸 + 공통 지식 문서 표(적재 검산), 기준 문서 고정 사본 */
export default async function LibraryPage({ searchParams }: PageProps<"/admin/library">) {
  const me = await requireAtLeast("admin", "/admin/library");
  if (!me) return <NoAccess title="공통 자료·틀" need="관리자" />;
  const sp = await searchParams;
  const tab = one(sp.tab) === "harness" ? "harness" : "knowledge";
  const docId = one(sp.doc);
  const supabase = await createClient();
  const [{ data: docs }, { data: facets }] = await Promise.all([
    supabase.from("knowledge_documents").select("doc_id, title, file_name, edition, published, issuer, basis_year, tracks, scope, status, supersedes, sha256, parser_version, chunk_count, unit_counts, checks, updated_at").order("published", { ascending: false }),
    supabase.from("knowledge_chunks").select("doc_id, searchable"),
  ]);
  const sources = harnessSources();
  const sizes = tab === "knowledge" ? sharedSizeReport(await loadBundleChunks(supabase), []) : [];
  const chunks = (facets ?? []).length;
  const unsearchable = (facets ?? []).filter((f) => !f.searchable).length;
  const warn = (d: { checks?: unknown }) => (Array.isArray(d.checks) ? (d.checks as Check[]).filter((c) => !c.ok) : []);
  const peek = docId ? (docs ?? []).find((d) => d.doc_id === docId) : undefined;
  const checks: Check[] = peek && Array.isArray(peek.checks) ? peek.checks : [];
  const failed = checks.filter((c) => !c.ok);
  const passed = checks.filter((c) => c.ok);
  const warnTotal = (docs ?? []).reduce((n, d) => n + warn(d).length, 0);
  const peerDoc = (docs ?? []).find((d) => d.doc_id === PEER_DOC_ID);
  const fileCount = sources.reduce((n, s) => n + s.files.length, 0);

  return (
    <Screen
      header={<PageHeader title="공통 자료·틀" />}
      peek={
        peek && (
          <Peek label="문서 정보" eyebrow={[peek.issuer, peek.edition].filter(Boolean).join(" · ") || undefined} title={peek.title} closeHref={`/admin/library?tab=${tab}`} width={680}>
            <div className="flex flex-col gap-5 px-6 py-5 text-ui">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted">파일</dt>
                <dd className="truncate" title={peek.file_name}>
                  {peek.file_name}
                </dd>
                <dt className="text-muted">적재 범위</dt>
                <dd className="leading-5">{peek.scope ?? "—"}</dd>
                <dt className="text-muted">트랙</dt>
                <dd>{(peek.tracks ?? []).join(", ") || "—"}</dd>
                <dt className="text-muted">조각</dt>
                <dd>
                  {peek.chunk_count}개 ·{" "}
                  {Object.entries((peek.unit_counts ?? {}) as Record<string, number>)
                    .map(([k, v]) => `${UNIT_LABEL[k] ?? k} ${v}`)
                    .join(" · ")}
                </dd>
                <dt className="text-muted">파서 · 해시</dt>
                <dd className="font-mono text-xs">
                  {peek.parser_version ?? "—"} · {String(peek.sha256 ?? "").slice(0, 12)}
                </dd>
                <dt className="text-muted">발행</dt>
                <dd>{fmtDate(peek.published)}</dd>
                {peek.supersedes && (
                  <>
                    <dt className="text-muted">대체 문서</dt>
                    <dd>{peek.supersedes}</dd>
                  </>
                )}
              </dl>
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-navy">
                  적재 검산 {checks.length}건{failed.length ? <span className="ml-2 font-normal text-warn">주의·실패 {failed.length}</span> : null}
                </h3>
                {failed.length > 0 && <CheckList items={failed} />}
                {passed.length > 0 && (
                  <details open={failed.length === 0 && passed.length <= 6}>
                    <summary className="w-fit cursor-pointer text-xs text-muted-2 hover:text-navy">통과 {passed.length}건</summary>
                    <div className="mt-2">
                      <CheckList items={passed} />
                    </div>
                  </details>
                )}
              </section>
              <div className="flex flex-col gap-4">
                <Link href={`/knowledge?doc=${peek.doc_id}`} className={`${T.btn} w-fit`}>
                  조각 보기 →
                </Link>
                {(UPLOADED_ID.test(peek.doc_id) || peek.doc_id === PEER_DOC_ID) && <DocDelete key={peek.doc_id} docId={peek.doc_id} title={peek.title} peer={peek.doc_id === PEER_DOC_ID} />}
              </div>
            </div>
          </Peek>
        )
      }
    >
      <Toolbar>
        <LinkTabs
          label="자료 종류"
          tabs={[
            { href: "/admin/library", label: "공통 지식", n: (docs ?? []).length, on: tab === "knowledge" },
            { href: "/admin/library?tab=harness", label: "기준 문서(고정 사본)", n: fileCount, on: tab === "harness" },
          ]}
        />
        {tab === "knowledge" && (
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            조각 {chunks.toLocaleString("ko-KR")}개{unsearchable > 0 ? ` · 검색 제외 ${unsearchable}` : ""}
            {warnTotal > 0 && <Tag tone="warn">검산 주의 {warnTotal}</Tag>}
          </span>
        )}
      </Toolbar>

      {tab === "knowledge" && (
        <LibraryUpload sizes={sizes} peer={peerDoc ? { rows: peerDoc.chunk_count, fileName: peerDoc.file_name, updatedAt: fmtDateTime(peerDoc.updated_at) } : null} />
      )}
      {tab === "knowledge" && (
        <Panel>
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[720px]`}>
              <colgroup>
                <col />
                <col className="w-[120px]" />
                <col className="w-[72px]" />
                <col className="w-[96px]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["문서", "판", "조각", "검산", "적재일"].map((h) => (
                    <th key={h} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(docs ?? []).map((d) => {
                  const w = warn(d);
                  return (
                    <tr key={d.doc_id} className={d.doc_id === docId ? T.rowOn : T.row}>
                      <td className={`${T.td} truncate`}>
                        <Link href={`/admin/library?doc=${d.doc_id}`} scroll={false} className="font-semibold text-navy no-underline hover:underline" title={d.title}>
                          {d.title}
                        </Link>
                        {UPLOADED_ID.test(d.doc_id) && (
                          <span className="ml-2 align-middle">
                            <Tag title="화면에서 올린 문서">올림</Tag>
                          </span>
                        )}
                        {DOC_STATUS[d.status] && (
                          <span className="ml-2 align-middle">
                            <Tag>{DOC_STATUS[d.status]}</Tag>
                          </span>
                        )}
                      </td>
                      <td className={`${T.td} truncate text-muted-2`}>{d.edition ?? "—"}</td>
                      <td className={`${T.td} font-mono text-ui text-muted-2`}>{d.chunk_count}</td>
                      <td className={T.td}>{w.length ? <Tag tone="warn">주의 {w.length}</Tag> : <Tag tone="link">통과</Tag>}</td>
                      <td className={`${T.td} font-mono text-xs text-muted`}>{fmtDate(d.updated_at)}</td>
                    </tr>
                  );
                })}
                {(docs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                      아직 올린 문서가 없습니다. 위에 파일을 끌어 놓아 시작하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "harness" &&
        sources.map((s) => (
          <Panel key={s.id} title={s.id === "pdca" ? "담당자 작성지원 지침(pdca)" : "report-harness 기준 문서"} aside={s.commit ? <span className="font-mono">{s.commit.slice(0, 8)}</span> : <span>{s.origin}</span>}>
            <div className="flex flex-col gap-1 border-b border-line px-5 py-3 text-xs text-muted-2">
              {s.subject && (
                <span className="truncate" title={s.subject}>
                  {fmtDateTime(s.commitDate)} · {s.subject}
                </span>
              )}
              <span>{s.note}</span>
            </div>
            <ul className="flex flex-col">
              {s.files.map((f) => (
                <li key={f.dest} className="flex min-w-0 items-center gap-3 border-b border-row-line px-5 py-2.5 text-ui last:border-b-0">
                  <span className="min-w-0 truncate font-semibold text-navy">{f.dest}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted">{Math.round(f.bytes / 1024)} KB</span>
                  <span className="shrink-0 font-mono text-xs text-muted" title={f.sha256}>
                    {f.sha256.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
    </Screen>
  );
}

/** 적재 검산 한 줄들(옆 창) */
function CheckList({ items }: { items: Check[] }) {
  return (
    <ul className="flex flex-col rounded-md border border-line">
      {items.map((c, i) => (
        <li key={i} className="flex min-w-0 flex-col gap-1 border-b border-row-line px-3 py-2 last:border-b-0">
          <span className="flex min-w-0 items-center gap-2">
            <Tag tone={c.ok ? "link" : c.level === "warn" ? "warn" : "warnSolid"}>{c.ok ? "통과" : c.level === "warn" ? "주의" : "실패"}</Tag>
            <span className="min-w-0 truncate" title={c.name}>
              {c.name}
            </span>
          </span>
          {c.note && <span className="text-xs text-muted-2">{c.note}</span>}
          <span className="truncate font-mono text-xs text-muted" title={JSON.stringify(c.actual)}>
            실제 {JSON.stringify(c.actual)}
            {c.expected !== undefined ? ` · 기대 ${JSON.stringify(c.expected)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
