import type { Metadata } from "next";
import Link from "next/link";
import { ChunkImages } from "../../../components/knowledge/chunk-images";
import { ChunkText } from "../../../components/knowledge/chunk-text";
import { type FilterGroup, KnowledgeFilter } from "../../../components/knowledge/knowledge-filter";
import { Empty, PageHeader, Panel, Peek, Screen, T, Tag } from "../../../components/ui/kit";
import { requireUser } from "../../../lib/auth/dal.ts";
import { BUSINESSES } from "../../../lib/knowledge/dictionaries.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { MGMT_INDICATORS } from "../../../lib/tracks/mgmt-units.ts";
import { cachedChunks, storeChunks } from "../../../lib/knowledge/chunk-cache.ts";
import { knowledgeImagePath, metaImages } from "../../../lib/knowledge/images.ts";
import { UNIT_LABEL } from "../../../lib/knowledge/labels.ts";
import { snippetText } from "../../../lib/knowledge/rich-text.ts";
import { buildSearchQuery } from "../../../lib/knowledge/search-query.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "공통 지식 · 경영평가 Sherpa" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE = 40;
const COLS = "chunk_key, doc_id, unit_type, business, title, context_prefix, printed_page, pdf_page_start, report_page_2025, text";

/** 유형·지표 집계용 행(select 열 그대로) */
interface FacetRow {
  doc_id: string;
  unit_type: string;
  business: string | null;
}
/** 검색·목록 결과 한 줄(COLS 열 그대로) */
interface ChunkListRow {
  chunk_key: string;
  doc_id: string;
  unit_type: string;
  business: string | null;
  title: string;
  context_prefix: string | null;
  printed_page: number | null;
  pdf_page_start: number | null;
  report_page_2025: number | null;
  text: string | null;
}
/** 조각과 연결된 과제(card 조인은 객체로도 배열로도 옴) */
interface LinkedCardRow {
  status: string;
  card: LinkedCard | LinkedCard[] | null;
}
interface LinkedCard {
  uid: string;
  task_no: string;
  title: string;
}

/**
 * 유형·지표 집계용 조각 목록 — 한 번에 1,000행까지만 돌아오므로(PostgREST 기본 한도) 모자랄 때까지 이어서 읽음.
 * 화면을 열 때마다 전 조각(약 5천 행)을 훑지 않게 공통 지식 조각 캐시(5분, 올리기·지우기 때 비움 — lib/knowledge/chunk-cache.ts)에 둠(개선 계획 P2-7)
 */
async function facetRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<FacetRow[]> {
  const hit = cachedChunks<FacetRow>("facets");
  if (hit) return hit;
  const rows: FacetRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("knowledge_chunks").select("doc_id, unit_type, business").order("chunk_key").range(from, from + 999);
    if (error) return rows; // 실패한 집계는 캐시에 두지 않음
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  storeChunks("facets", rows);
  return rows;
}

/** 공통 지식(로그인 전원 — 부서 담당자는 읽기 전용, 성과관리팀 연결 링크만 다름): 적재한 경영평가 문서 조각을 검색·열람 — AI 작성지원·점검이 쓰는 근거와 같은 자료 */
export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const me = await requireUser("/knowledge");
  const staff = me.role !== "dept_user";
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 100);
  const doc = one(sp.doc);
  const type = one(sp.type);
  const biz = one(sp.biz);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const chunkKey = one(sp.chunk);
  const track = await getTrack();
  const supabase = await createClient();

  const [{ data: docs }, facets] = await Promise.all([
    supabase.from("knowledge_documents").select("doc_id, title, edition, published, chunk_count, status").order("published", { ascending: false }),
    facetRows(supabase),
  ]);
  const inScope = (f: FacetRow) => (!doc || f.doc_id === doc) && (!biz || f.business === biz);
  const typeCounts = new Map<string, number>();
  for (const f of facets ?? []) if (inScope(f)) typeCounts.set(f.unit_type, (typeCounts.get(f.unit_type) ?? 0) + 1);

  let results: ChunkListRow[] = [];
  let total = 0;
  let loose = false;
  if (q) {
    const filters = { doc_ids: doc ? [doc] : null, unit_types: type ? [type] : null, businesses: biz ? [biz] : null, max_rows: 60 };
    let { data } = await supabase.rpc("search_knowledge", { query: buildSearchQuery(q, "all"), ...filters });
    if (!data?.length) {
      ({ data } = await supabase.rpc("search_knowledge", { query: buildSearchQuery(q, "any"), ...filters }));
      loose = Boolean(data?.length);
    }
    const keys = ((data as Array<{ chunk_key: string }> | null) ?? []).map((r) => r.chunk_key);
    const rows = keys.length ? ((await supabase.from("knowledge_chunks").select(COLS).in("chunk_key", keys)).data ?? []) : [];
    results = keys.map((k) => rows.find((r) => r.chunk_key === k)).filter(Boolean) as ChunkListRow[];
    total = results.length;
  } else {
    let query = supabase.from("knowledge_chunks").select(COLS, { count: "exact" });
    if (doc) query = query.eq("doc_id", doc);
    if (type) query = query.eq("unit_type", type);
    if (biz) query = query.eq("business", biz);
    const { data, count } = await query.order("doc_id").order("seq").range((page - 1) * PAGE, page * PAGE - 1);
    results = data ?? [];
    total = count ?? 0;
  }
  const [{ data: peek }, { data: linked }] = chunkKey
    ? await Promise.all([
        supabase.from("knowledge_chunks").select(`${COLS}, dept_resp, dept_coop, eval_item, measure, q_type, meta`).eq("chunk_key", chunkKey).maybeSingle(),
        supabase.from("card_knowledge_scope").select("status, score, card:cards!inner(uid, task_no, title)").eq("chunk_key", chunkKey).eq("card.status", "active").neq("status", "rejected"),
      ])
    : [{ data: null }, { data: null }];

  // 조각의 그림(원본 그 쪽 — meta.images, lib/knowledge/images.ts): 비공개 버킷 knowledge/<doc_id>/images/<이름>을 로그인 사용자 권한으로 서명(1시간)
  const peekImageNames = peek ? metaImages(peek.meta) : [];
  const peekImages = peekImageNames.length
    ? await supabase.storage
        .from("knowledge")
        .createSignedUrls(
          peekImageNames.map((n) => knowledgeImagePath(peek!.doc_id, n)),
          3600,
        )
        .then(({ data }) => (data ?? []).flatMap((d, i) => (d.signedUrl ? [{ name: peekImageNames[i], url: d.signedUrl }] : [])))
    : [];

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur = { q, doc, type, biz, page: page > 1 ? String(page) : "", chunk: chunkKey };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/knowledge?${s}` : "/knowledge";
  };
  const docTitle = new Map((docs ?? []).map((d) => [d.doc_id, d.title]));
  // 문서·유형·지표 선택지는 많아(문서만 50여 개) 칩 줄로 펼치지 않고 「필터」 팝오버로 — 고른 조건만 칩으로 보임
  const bizOptions = track === "경영관리" ? MGMT_INDICATORS.map((m) => ({ id: m.id, label: `지표${m.no} · ${m.name}` })) : BUSINESSES.map((b) => ({ id: b.id, label: `${b.cardGroup ?? "공통지표"} · ${b.name2026}` }));
  const filterGroups: FilterGroup[] = [
    { key: "doc", label: "문서", current: doc, allHref: href({ doc: "", page: "" }), options: (docs ?? []).map((d) => ({ value: d.doc_id, label: d.title, n: d.chunk_count, href: href({ doc: d.doc_id, page: "" }) })) },
    {
      key: "type",
      label: "유형",
      current: type,
      allHref: href({ type: "", page: "" }),
      options: [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ value: t, label: UNIT_LABEL[t] ?? t, n, href: href({ type: t, page: "" }) })),
    },
    { key: "biz", label: track === "경영관리" ? "지표" : "사업", current: biz, allHref: href({ biz: "", page: "" }), options: bizOptions.map((b) => ({ value: b.id, label: b.label, href: href({ biz: b.id, page: "" }) })) },
  ];

  return (
    <Screen
      header={<PageHeader title="공통 지식" />}
      peek={
        peek && (
          <Peek label="지식 조각" eyebrow={`${docTitle.get(peek.doc_id) ?? peek.doc_id}`} title={peek.title} closeHref={href({ chunk: "" })} width={680}>
            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="flex flex-wrap gap-1.5">
                <Tag tone="link">{UNIT_LABEL[peek.unit_type] ?? peek.unit_type}</Tag>
                {peek.business && <Tag>{BUSINESSES.find((b) => b.id === peek.business)?.name2026 ?? MGMT_INDICATORS.find((m) => m.id === peek.business)?.name ?? peek.business}</Tag>}
                {peek.printed_page && <Tag>{peek.printed_page}쪽</Tag>}
                {peek.report_page_2025 && <Tag>2025 보고서 {peek.report_page_2025}쪽</Tag>}
                {(peek.q_type ?? []).map((t: string) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <p className="text-xs leading-5 text-muted">{peek.context_prefix}</p>
              {/* 증빙 그림 쪽은 그림이 본문이라 글보다 먼저 */}
              {peek.unit_type === "evidence_image" && <ChunkImages images={peekImages} label="이 쪽의 그림" />}
              <ChunkText text={String(peek.text ?? "")} />
              {peek.unit_type !== "evidence_image" && <ChunkImages images={peekImages} label="원본 그림" />}
              {(peek.dept_resp?.length ?? 0) + (peek.dept_coop?.length ?? 0) > 0 && (
                <p className="text-xs text-muted-2">
                  담당 {peek.dept_resp?.join(", ") || "—"} · 협조 {peek.dept_coop?.join(", ") || "—"}
                </p>
              )}
              {(linked ?? []).length > 0 && (
                <section className="flex flex-col gap-1.5 rounded-md border border-line px-3 py-2.5">
                  <h3 className="text-xs font-bold text-navy">이 자료와 연결된 과제 {(linked ?? []).length}</h3>
                  <ul className="flex flex-col gap-1 text-ui">
                    {((linked ?? []) as LinkedCardRow[]).map((l) => {
                      const c = Array.isArray(l.card) ? l.card[0] : l.card;
                      return c ? (
                        <li key={c.uid} className="flex min-w-0 items-center gap-2">
                          <span className="w-10 shrink-0 font-mono text-navy">{c.task_no}</span>
                          <Link href={staff ? `/links?peek=${c.uid}` : withReturn(`/cards/${c.uid}`, href({}))} className="min-w-0 truncate text-ink no-underline hover:underline" title={c.title}>
                            {c.title}
                          </Link>
                          <span className="ml-auto shrink-0">
                            <Tag tone={l.status === "confirmed" ? "navy" : "warn"}>{l.status === "confirmed" ? "확정" : "확정 전"}</Tag>
                          </span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </section>
              )}
              <p className="font-mono text-xs text-muted">{peek.chunk_key}</p>
            </div>
          </Peek>
        )
      }
    >
      <form action="/knowledge" className="flex min-w-0 flex-wrap items-center gap-2">
        {doc && <input type="hidden" name="doc" value={doc} />}
        {type && <input type="hidden" name="type" value={type} />}
        {biz && <input type="hidden" name="biz" value={biz} />}
        <label className="flex h-10 min-w-0 grow items-center gap-2 rounded-md border border-line-strong bg-paper px-3 focus-within:border-navy">
          <span className="sr-only">공통 지식 검색</span>
          <input name="q" defaultValue={q} placeholder="예: 사후검증 시간 산식, 전파품질 목표 도전성" className="min-w-0 grow border-0 bg-transparent text-sm outline-none" />
        </label>
        <button type="submit" className={T.btnPrimary}>
          검색
        </button>
        {q && (
          <Link href={href({ q: "", page: "" })} className={T.btn}>
            검색 지우기
          </Link>
        )}
      </form>

      <KnowledgeFilter groups={filterGroups} clearHref={href({ doc: "", type: "", biz: "", page: "" })} />

      <Panel title={q ? `「${q}」 검색 결과 ${total}건${loose ? " · 모든 낱말이 든 결과가 없어 한 낱말이라도 든 결과" : ""}` : `조각 ${total}건`} aside={!q && total > PAGE ? `${page} / ${Math.ceil(total / PAGE)}쪽` : undefined}>
        {results.length === 0 ? (
          <Empty title={q ? "찾은 조각이 없습니다." : "조각이 없습니다."}>{q ? "낱말을 줄이거나 필터를 풀어 보세요." : "관리자가 공통 지식을 적재하면 여기에 보입니다."}</Empty>
        ) : (
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.chunk_key} className={`border-b border-row-line last:border-b-0 ${r.chunk_key === chunkKey ? "bg-row-hover" : ""}`}>
                <Link href={href({ chunk: r.chunk_key })} scroll={false} className="flex min-w-0 flex-col gap-1 px-5 py-3 no-underline hover:bg-row-hover">
                  <span className="flex min-w-0 items-center gap-2">
                    <Tag tone="link">{UNIT_LABEL[r.unit_type] ?? r.unit_type}</Tag>
                    <span className="truncate text-sm font-semibold text-navy" title={r.title}>
                      {r.title}
                    </span>
                    {r.printed_page && <span className="ml-auto shrink-0 font-mono text-xs text-muted">{r.printed_page}쪽</span>}
                  </span>
                  <span className="line-clamp-2 text-ui leading-5 text-muted-2">{snippetText(String(r.text ?? ""))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {!q && total > PAGE && (
        <nav aria-label="쪽" className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={href({ page: String(page - 1) })} className={T.btn}>
              ← 이전
            </Link>
          )}
          <span className="font-mono text-xs text-muted">
            {page} / {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total && (
            <Link href={href({ page: String(page + 1) })} className={T.btn}>
              다음 →
            </Link>
          )}
        </nav>
      )}
    </Screen>
  );
}
