import type { Metadata } from "next";
import Link from "next/link";
import { ChunkText } from "../../../components/knowledge/chunk-text";
import { BulkConfirm, LinkButtons, TaskMapForm } from "../../../components/links/link-buttons";
import { Empty, LinkTabs, NoAccess, PageHeader, Panel, Peek, Screen, StatPanel, T, Tag, Toolbar, type Tone } from "../../../components/ui/kit";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { listCards } from "../../../lib/cards/queries.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { SCOPE_GROUPS } from "../../../lib/prep/scope.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "지적·과제 연결 · 경영AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);
// 지적 연결의 자동·후보는 「참고」 — 확정하지 않아도 AI는 규칙 범위 전부를 보므로 재촉하는 경고색을 쓰지 않음(3-5 재정의)
const LINK_LABEL: Record<string, [string, Tone]> = { auto: ["자동 초안", "muted"], candidate: ["참고 후보", "muted"], confirmed: ["확정", "navy"], rejected: ["제외", "muted"] };
const TASK_TONE: Record<string, Tone> = { 같음: "link", 후보: "warn", "약한 후보": "warnSolid", "대응 없음": "muted" };

/** card_knowledge_scope select 한 행(chunk 조인은 객체로도 배열로도 옴) */
interface LinkDbRow {
  card_id: string;
  chunk_key: string;
  method: string | null;
  score: number | null;
  basis: string | null;
  rank: number | null;
  status: string;
  meta: { card_finding?: string; link_method?: string } | null;
  chunk: LinkChunk | LinkChunk[] | null;
}
interface LinkChunk {
  title: string;
  context_prefix: string | null;
  text: string | null;
  doc_id: string;
  printed_page: number | null;
  unit_type: string;
}
/** task_map select 한 행 */
interface TaskMapDbRow {
  card_id: string;
  plan_task_key: string | null;
  report2025_task: string | null;
  draft_status: string;
  score: number | null;
  status: string;
  note: string | null;
  plan: { title: string; text: string | null } | Array<{ title: string; text: string | null }> | null;
}

/** 성과관리팀 · 지적·과제 연결: 적재가 만든 초안(카드 지적사항 ↔ 평가보고서 지적 원문, 9월 카드 ↔ 7월 과제 목록)을 확정 */
export default async function LinksPage({ searchParams }: PageProps<"/links">) {
  const me = await requireAtLeast("pmo", "/links");
  if (!me) return <NoAccess title="지적·과제 연결" need="성과관리팀" />;
  const sp = await searchParams;
  const tab = one(sp.tab) === "tasks" ? "tasks" : "findings";
  const filter = one(sp.f);
  const peekUid = one(sp.peek);
  const supabase = await createClient();
  const [bizCards, mgmtCards, { data: links }, { data: tasks }] = await Promise.all([
    listCards(),
    listCards({ track: "경영관리" }), // 경영관리 카드도 시정조치 계획 연결을 확정해야 함(과제 대응·옛 지적 연결은 주요사업 카드만 있음)
    // 지금 화면은 지적 연결(대응표 「지적」 묶음)만 — 유형별 탭 확장은 참고자료 3-5
    supabase
      .from("card_knowledge_scope")
      .select("card_id, chunk_key, method, score, basis, rank, status, meta, chunk:knowledge_chunks!inner(title, context_prefix, text, doc_id, printed_page, unit_type)")
      .in("chunk.unit_type", [...SCOPE_GROUPS[0].unitTypes])
      .order("card_id")
      .order("rank", { nullsFirst: false })
      .order("chunk_key"),
    supabase.from("task_map").select("card_id, plan_task_key, report2025_task, draft_status, score, status, note, plan:knowledge_chunks(title, text)"),
  ]);
  const cards = [...bizCards, ...mgmtCards];
  const byId = new Map(cards.map((c) => [c.id, c]));
  // 규칙 연결의 지적 단위 정보(meta)를 화면이 쓰던 모양으로 펼침
  const linkRows = ((links ?? []) as LinkDbRow[]).map((l) => ({ ...l, card_finding: l.meta?.card_finding || (l.basis ? `AI: ${l.basis}` : ""), method: l.meta?.link_method ?? l.method }));
  const taskRows = ((tasks ?? []) as TaskMapDbRow[]).sort((a, b) => {
    const ca = byId.get(a.card_id);
    const cb = byId.get(b.card_id);
    return (ca?.evalUnitId ?? "").localeCompare(cb?.evalUnitId ?? "") || String(a.card_id).localeCompare(String(b.card_id), "ko");
  });
  const linkDone = linkRows.filter((l) => l.status === "confirmed" || l.status === "rejected").length;
  const taskDone = taskRows.filter((t) => t.status === "confirmed").length;
  const shownLinks = linkRows.filter((l) => !filter || (filter === "open" ? !["confirmed", "rejected"].includes(l.status) : l.status === filter));
  const shownTasks = taskRows.filter((t) => !filter || (filter === "open" ? t.status !== "confirmed" : t.status === filter));
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (tab === "tasks") p.set("tab", "tasks");
    if (filter) p.set("f", filter);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/links?${s}` : "/links";
  };
  const peek = peekUid ? cards.find((c) => c.uid === peekUid) : undefined;
  const peekLinks = peek ? linkRows.filter((l) => l.card_id === peek.id) : [];
  const peekTask = peek ? taskRows.find((t) => t.card_id === peek.id) : undefined;
  const filterTabs = (openLabel: string) => [
    { href: tabHref(tab, ""), label: "전체", on: !filter },
    { href: tabHref(tab, "open"), label: openLabel, on: filter === "open" },
    { href: tabHref(tab, "confirmed"), label: "확정", on: filter === "confirmed" },
  ];

  return (
    <Screen
      header={
        <PageHeader title="지적·과제 연결">
          {tab === "tasks" ? (
            <BulkConfirm kind="tasks" count={taskRows.filter((t) => t.status === "draft" && t.draft_status === "같음").length} label="「같음」 일괄 확정" />
          ) : (
            <BulkConfirm kind="findings" count={linkRows.filter((l) => ["auto", "candidate"].includes(l.status) && Number(l.score ?? 0) >= 0.9).length} label="점수 0.9 이상 일괄 확정" />
          )}
        </PageHeader>
      }
      peek={
        peek && (
          <Peek label="연결 확인" eyebrow={`${peek.business} · ${peek.taskNo} · ${peek.team ?? peek.department}`} title={peek.title} closeHref={href({})} width={720} actions={<Link href={withReturn(`/cards/${peek.uid}`, href({ peek: peek.uid }))} className={T.btn}>카드 원문</Link>}>
            <div className="flex flex-col gap-6 px-6 py-5">
              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-navy">카드 지적사항 ↔ 평가보고서 지적 원문 {peekLinks.length}건</h3>
                {peekLinks.length === 0 && <p className="text-ui text-muted">자동 연결 후보가 없습니다.</p>}
                {peekLinks.map((l) => {
                  const c = first(l.chunk);
                  const [label, tone] = LINK_LABEL[l.status] ?? [l.status, "muted"];
                  return (
                    <div key={l.chunk_key} className="flex flex-col gap-2 rounded-md border border-line p-3">
                      <div className="flex items-center gap-2">
                        <Tag tone={tone}>{label}</Tag>
                        <span className="font-mono text-xs text-muted">
                          점수 {Number(l.score ?? 0).toFixed(2)} · {l.method}
                        </span>
                        <span className="ml-auto">
                          <LinkButtons linkKey={{ cardId: l.card_id, chunkKey: l.chunk_key }} status={l.status} />
                        </span>
                      </div>
                      <p className="border-l-2 border-navy pl-3 text-ui leading-5 text-ink">
                        <span className="mr-1 text-xs font-semibold text-muted">카드</span>
                        {l.card_finding}
                      </p>
                      <details className="text-ui leading-5 text-muted-2">
                        <summary className="cursor-pointer text-xs font-semibold text-link">
                          원문 · {c?.title ?? l.chunk_key}
                          {c?.printed_page ? ` · ${c.printed_page}쪽` : ""}
                        </summary>
                        <ChunkText text={String(c?.text ?? "")} className="mt-2 text-ui leading-6" />
                      </details>
                    </div>
                  );
                })}
              </section>
              {peekTask && (
                <section className="flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-navy">과제 대응(9월 카드 ↔ 7월 과제 목록 ↔ 2025 실행과제)</h3>
                  <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-ui">
                    <dt className="text-muted">초안 판정</dt>
                    <dd>
                      <Tag tone={TASK_TONE[peekTask.draft_status] ?? "muted"}>{peekTask.draft_status ?? "—"}</Tag>
                      <span className="ml-2 font-mono text-xs text-muted">점수 {Number(peekTask.score ?? 0).toFixed(2)}</span>
                    </dd>
                    <dt className="text-muted">7월 과제 목록</dt>
                    <dd className="text-ink">{first(peekTask.plan)?.title ?? "대응 행 없음"}</dd>
                    <dt className="text-muted">2025 실행과제</dt>
                    <dd className="text-ink">{peekTask.report2025_task ?? "—"}</dd>
                  </dl>
                  <TaskMapForm cardId={peekTask.card_id} status={peekTask.status} note={peekTask.note} />
                </section>
              )}
            </div>
          </Peek>
        )
      }
    >
      <StatPanel
        metrics={[
          { label: "지적 연결", value: linkRows.length, sub: `확정·제외 ${linkDone} · 참고(확정 전) ${linkRows.length - linkDone}`, href: "/links" },
          { label: "과제 대응", value: taskRows.length, sub: `확정 ${taskDone} · 남음 ${taskRows.length - taskDone}`, href: "/links?tab=tasks", tone: taskRows.length - taskDone ? "warn" : undefined },
          { label: "대응 없음(초안)", value: taskRows.filter((t) => t.draft_status === "대응 없음").length, sub: "7월 목록에 없는 9월 과제", href: "/links?tab=tasks" },
          { label: "약한 후보(초안)", value: taskRows.filter((t) => t.draft_status === "약한 후보").length, sub: "부서 협의가 필요한 대응", href: "/links?tab=tasks" },
        ]}
      />
      <Toolbar>
        <LinkTabs
          label="연결 종류"
          tabs={[
            { href: "/links", label: "지적 연결", n: linkRows.length, on: tab === "findings" },
            { href: "/links?tab=tasks", label: "과제 대응", n: taskRows.length, on: tab === "tasks" },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {filterTabs(tab === "tasks" ? "확정 전" : "확정·제외 전").map((f) => (
            <Link key={f.label} href={f.href} className={`rounded-full border px-2.5 py-0.5 text-xs no-underline ${f.on ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-muted-2 hover:border-navy"}`}>
              {f.label}
            </Link>
          ))}
        </div>
      </Toolbar>

      {tab === "findings" ? (
        <Panel>
          {shownLinks.length === 0 ? (
            <Empty title="보여 줄 연결이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className={`${T.table} min-w-[980px]`}>
                <colgroup>
                  <col className="w-[72px]" />
                  <col className="w-[22%]" />
                  <col />
                  <col className="w-[24%]" />
                  <col className="w-[64px]" />
                  <col className="w-[104px]" />
                </colgroup>
                <thead>
                  <tr className={T.headRow}>
                    {["번호", "과제", "카드 지적사항", "지적 원문", "점수", "상태"].map((h) => (
                      <th key={h} scope="col" className={T.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownLinks.map((l) => {
                    const card = byId.get(l.card_id);
                    const c = first(l.chunk);
                    const [label, tone] = LINK_LABEL[l.status] ?? [l.status, "muted"];
                    return (
                      <tr key={`${l.card_id}:${l.chunk_key}`} className={card?.uid === peekUid ? T.rowOn : T.row}>
                        <td className={`${T.td} font-mono text-ui text-navy`}>{card?.taskNo ?? "—"}</td>
                        <td className={`${T.td} truncate`}>
                          {card ? (
                            <Link href={href({ peek: card.uid })} scroll={false} className="block truncate font-semibold text-navy no-underline hover:underline" title={card.title}>
                              {card.title}
                            </Link>
                          ) : (
                            l.card_id
                          )}
                        </td>
                        <td className={`${T.td} truncate text-muted-2`} title={l.card_finding}>
                          {l.card_finding}
                        </td>
                        <td className={`${T.td} truncate text-muted-2`} title={c?.title}>
                          {c?.title ?? l.chunk_key}
                        </td>
                        <td className={`${T.td} font-mono text-xs text-muted`}>{Number(l.score ?? 0).toFixed(2)}</td>
                        <td className={T.td}>
                          <Tag tone={tone}>{label}</Tag>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel>
          {shownTasks.length === 0 ? (
            <Empty title="보여 줄 대응이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className={`${T.table} min-w-[980px]`}>
                <colgroup>
                  <col className="w-[72px]" />
                  <col />
                  <col className="w-[30%]" />
                  <col className="w-[96px]" />
                  <col className="w-[64px]" />
                  <col className="w-[88px]" />
                </colgroup>
                <thead>
                  <tr className={T.headRow}>
                    {["번호", "9월 카드", "7월 과제 목록", "초안 판정", "점수", "상태"].map((h) => (
                      <th key={h} scope="col" className={T.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownTasks.map((t) => {
                    const card = byId.get(t.card_id);
                    return (
                      <tr key={t.card_id} className={card?.uid === peekUid ? T.rowOn : T.row}>
                        <td className={`${T.td} font-mono text-ui text-navy`}>{card?.taskNo ?? "—"}</td>
                        <td className={`${T.td} truncate`}>
                          {card ? (
                            <Link href={href({ peek: card.uid })} scroll={false} className="block truncate font-semibold text-navy no-underline hover:underline" title={card.title}>
                              {card.title}
                            </Link>
                          ) : (
                            t.card_id
                          )}
                        </td>
                        <td className={`${T.td} truncate text-muted-2`} title={first(t.plan)?.title}>
                          {first(t.plan)?.title ?? <span className="text-muted">대응 행 없음</span>}
                        </td>
                        <td className={T.td}>
                          <Tag tone={TASK_TONE[t.draft_status] ?? "muted"}>{t.draft_status ?? "—"}</Tag>
                        </td>
                        <td className={`${T.td} font-mono text-xs text-muted`}>{Number(t.score ?? 0).toFixed(2)}</td>
                        <td className={T.td}>{t.status === "confirmed" ? <Tag tone="navy">확정</Tag> : <Tag>초안</Tag>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </Screen>
  );
}

function tabHref(tab: string, f: string) {
  const p = new URLSearchParams();
  if (tab === "tasks") p.set("tab", "tasks");
  if (f) p.set("f", f);
  const s = p.toString();
  return s ? `/links?${s}` : "/links";
}
