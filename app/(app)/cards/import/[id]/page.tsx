import { List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplySafeButton, LedgerItemReview, RegisterItem } from "../../../../../components/cards/import/import-controls";
import { Empty, NoAccess, PageHeader, Panel, Peek, Screen, StatPanel, T, Tag } from "../../../../../components/ui/kit";
import { requireAtLeast } from "../../../../../lib/auth/dal.ts";
import { type BlockKey, type SyncPlan, planSync } from "../../../../../lib/cards/hwp/sync.ts";
import { fmtDateTime } from "../../../../../lib/format.ts";
import { withReturn } from "../../../../../lib/nav/return-to.ts";
import { createClient } from "../../../../../lib/supabase/server.ts";
import type { ImportFileMeta } from "../actions";
import type { LooseJson } from "../../../../../lib/loose-json.ts";

export const metadata: Metadata = { title: "현행화 검토 · 경영AI비서" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SHORT: Record<BlockKey, string> = {
  basic: "기본정보",
  index: "목차",
  kpi: "계량지표",
  strategy: "전략",
  act: "Act",
  plan: "Plan",
  do: "Do",
  monthly: "월별 실적",
  check: "Check",
  outcome: "추진성과",
  ax: "AX 붙임",
  feedback: "전년도 환류",
  findings: "지적·개선방안",
};
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** card_import_items select 한 행(parsed = 파일에서 읽은 카드 JSON — 칸이 많아 넓은 모양 그대로) */
interface ReviewItemRow {
  id: number;
  file_n: number;
  seq: number;
  task_no: string | null;
  title: string | null;
  group_id: string | null;
  parsed: LooseJson;
  match: "exact" | "uncertain" | "none";
  match_reason: string | null;
  card_id: string | null;
  candidates: string[];
  status: string;
  result: { registered?: boolean; blocks?: BlockKey[]; reason?: string } | null;
  decided_at: string | null;
}
/** 이 화면이 읽는 원장 카드(data = 카드 JSON) */
interface ReviewCardRow {
  id: string;
  uid: string;
  task_no: string;
  title: string;
  data: LooseJson;
  fixed_locked_at: string | null;
  status: string;
}

/** 현행화 묶음 검토: 과제별 매칭·바뀐 블록·위험 → 전체 반영(위험 없는 것) 또는 건별 승인 */
export default async function ImportReviewPage({ params, searchParams }: PageProps<"/cards/import/[id]">) {
  const { id: raw } = await params;
  const sp = await searchParams;
  const me = await requireAtLeast("pmo", `/cards/import/${raw}`);
  if (!me) return <NoAccess title="현행화 검토" need="성과관리팀" />;
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const supabase = await createClient();
  const { data: imp } = await supabase.from("card_imports").select("id, scope, target_card_id, files, status, created_by, created_at").eq("id", id).maybeSingle();
  if (!imp) notFound();
  const { data: rows } = await supabase
    .from("card_import_items")
    .select("id, file_n, seq, task_no, title, group_id, parsed, match, match_reason, card_id, candidates, status, result, decided_at")
    .eq("import_id", id)
    .order("file_n")
    .order("seq");
  const items = (rows ?? []) as ReviewItemRow[];
  const files = (imp.files ?? []) as ImportFileMeta[];
  const ids = [...new Set(items.flatMap((i) => [i.card_id, ...((i.candidates as string[]) ?? [])]).filter(Boolean))] as string[];
  const [{ data: cards }, { data: signed }] = await Promise.all([
    ids.length ? supabase.from("cards").select("id, uid, task_no, title, data, fixed_locked_at, status").in("id", ids) : Promise.resolve({ data: [] as ReviewCardRow[] }),
    files.length ? supabase.storage.from("card-imports").createSignedUrls(files.map((f) => f.path), 600) : Promise.resolve({ data: [] as Array<{ signedUrl: string }> }),
  ]);
  const byId = new Map(((cards ?? []) as ReviewCardRow[]).map((c) => [c.id, c]));
  const fileName = (n: number) => files.find((f) => f.n === n)?.name ?? `파일 ${n}`;

  const view = items.map((it) => {
    const target = it.status === "pending" && it.card_id ? byId.get(it.card_id) : null;
    const plan: SyncPlan | null = target && target.status === "active" ? planSync(target.data, it.parsed, { locked: Boolean(target.fixed_locked_at), uncertain: it.match === "uncertain" ? it.match_reason : null }) : null;
    return { ...it, plan, target };
  });
  const pending = view.filter((v) => v.status === "pending");
  const safe = pending.filter((v) => v.match === "exact" && v.plan && !v.plan.risks.length && v.plan.defaults.length).length;
  const same = pending.filter((v) => v.match === "exact" && v.plan && !v.plan.risks.length && !v.plan.defaults.length).length;
  const risky = pending.filter((v) => v.plan && v.plan.risks.length).length;
  const none = pending.filter((v) => v.match === "none").length;

  // 고른 항목(옆 창). 불확실 매칭은 ?card=로 후보를 바꿔 다시 비교
  const sel = view.find((v) => String(v.id) === one(sp.item));
  let selCard: ReviewCardRow | null | undefined = null;
  let selPlan: SyncPlan | null = null;
  if (sel && sel.status === "pending" && sel.match !== "none") {
    const want = one(sp.card);
    const cid = want && (sel.candidates as string[]).includes(want) ? want : sel.card_id;
    selCard = cid ? byId.get(cid) : null;
    if (selCard && selCard.status === "active") selPlan = planSync(selCard.data, sel.parsed, { locked: Boolean(selCard.fixed_locked_at), uncertain: sel.match === "uncertain" ? sel.match_reason : null });
  }
  const base = `/cards/import/${id}`;
  // 지금 화면 주소(옆 창에 고른 항목·후보 포함) — 카드 원문(전체 페이지)에서 닫으면 여기로 돌아오게
  const hereQs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))).toString();
  const here = hereQs ? `${base}?${hereQs}` : base;

  const peek = sel ? (
    <Peek label="과제 현행화 검토" title={sel.title ?? "(과제명 없음)"} eyebrow={`${fileName(sel.file_n)} · ${sel.task_no ?? "번호 없음"}`} closeHref={base} width={720}>
      <div className="flex flex-col gap-4 px-6 py-4">
        <section className="flex flex-col gap-2 rounded-md border border-line bg-field px-4 py-3 text-ui">
          <p className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold text-muted">원장 매칭</span>
            {sel.match === "exact" ? <Tag tone="navy">확정</Tag> : sel.match === "uncertain" ? <Tag tone="warn">불확실</Tag> : <Tag tone="warnSolid">카드 미존재</Tag>}
            {sel.match_reason && (
              <span className="min-w-0 truncate text-muted-2" title={sel.match_reason}>
                {sel.match_reason}
              </span>
            )}
          </p>
          {sel.match !== "none" &&
            (sel.status === "pending" && sel.match === "uncertain" && (sel.candidates as string[]).length > 0 ? (
              <div className="flex flex-col gap-1" role="radiogroup" aria-label="반영할 원장 과제">
                <span className="text-xs text-muted">반영할 원장 과제를 고르세요</span>
                {(sel.candidates as string[]).map((cid) => {
                  const c = byId.get(cid);
                  const on = selCard?.id === cid;
                  return (
                    <Link key={cid} role="radio" aria-checked={on} href={`${base}?item=${sel.id}&card=${encodeURIComponent(cid)}`} scroll={false} className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 no-underline ${on ? "border-navy bg-paper" : "border-field-line hover:border-navy"}`}>
                      <span className={`size-3 shrink-0 rounded-full border ${on ? "border-navy bg-navy" : "border-field-line"}`} />
                      <span className="shrink-0 font-mono text-xs text-muted">{cid}</span>
                      <span className="min-w-0 truncate text-ink">{c?.title ?? "(보관·삭제된 카드)"}</span>
                    </Link>
                  );
                })}
              </div>
            ) : selCard ? (
              <p className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-xs text-muted">{selCard.id}</span>
                <Link href={withReturn(`/cards/${selCard.uid}`, here)} className="min-w-0 truncate text-link">
                  {selCard.title}
                </Link>
              </p>
            ) : null)}
        </section>

        {sel.status !== "pending" ? (
          <p className="rounded-md border border-line px-4 py-3 text-ui text-ink">
            {sel.status === "applied" ? (sel.result?.registered ? "새 과제로 등록했습니다." : `원장에 반영했습니다(${((sel.result?.blocks ?? []) as BlockKey[]).map((k) => SHORT[k]).join("·")}).`) : `건너뜀: ${sel.result?.reason ?? ""}`}
            {sel.decided_at && <span className="ml-2 font-mono text-xs text-muted">{fmtDateTime(sel.decided_at)}</span>}
          </p>
        ) : sel.match === "none" ? (
          <RegisterItem importId={id} itemId={sel.id} group={sel.group_id} />
        ) : selPlan ? (
          <LedgerItemReview key={`${sel.id}:${selCard!.id}`} importId={id} itemId={sel.id} cardId={selCard!.id} blocks={selPlan.blocks} defaults={selPlan.defaults} risks={selPlan.risks} />
        ) : (
          <p className="text-ui text-muted-2">반영할 원장 과제를 고르면 블록별 비교가 나옵니다.</p>
        )}
      </div>
    </Peek>
  ) : null;

  return (
    <Screen
      peek={peek}
      header={
        <PageHeader title="현행화 검토">
          <Link href="/cards/import" aria-label="목록으로 — 카드 현행화" title="목록으로 — 카드 현행화" className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}>
            <List size={16} aria-hidden />
          </Link>
          <ApplySafeButton importId={id} safe={safe} same={same} />
        </PageHeader>
      }
    >
      <StatPanel
        title="읽은 카드"
        total={items.length}
        unit="장"
        segments={[
          { label: "반영", n: view.filter((v) => v.status === "applied").length, tone: "navy", title: "원장에 들어감" },
          { label: "위험 없음", n: safe + same, tone: "accent", sub: `변경 ${safe} · 변경 없음 ${same}` },
          { label: "건별 승인", n: risky, tone: "warn", sub: "위험 트리거" },
          { label: "카드 미존재", n: none, tone: "line", title: "등록 또는 건너뛰기" },
        ]}
        metrics={[{ label: "올린 파일", value: files.length, sub: `${fmtDateTime(imp.created_at)} 올림` }]}
      />

      <Panel title="올린 파일">
        <ul className="flex flex-col">
          {files.map((f, i) => (
            <li key={f.n} className="flex min-w-0 items-center gap-3 border-b border-row-line px-5 py-2.5 text-ui last:border-b-0">
              <span className="w-12 shrink-0 font-mono text-xs text-muted uppercase">{f.type}</span>
              {signed?.[i]?.signedUrl ? (
                <a href={signed[i].signedUrl} className="min-w-0 truncate text-link" title={`${f.name} 원본 받기`}>
                  {f.name}
                </a>
              ) : (
                <span className="min-w-0 truncate">{f.name}</span>
              )}
              <span className="shrink-0 font-mono text-xs text-muted">{size(f.bytes)}</span>
              {f.group && <Tag>{f.group}</Tag>}
              {f.error ? (
                <span className="min-w-0 truncate text-xs text-warn" title={f.error}>
                  {f.error}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-2">카드 {f.cards ?? 0}장{f.note ? ` · ${f.note}` : ""}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="과제별 비교" aside="행을 누르면 블록별 변경 전·후와 승인">
        {view.length === 0 ? (
          <Empty title="읽은 카드가 없습니다.">{imp.status === "uploading" ? "올리기가 끝나지 않았습니다. 파일을 다시 올려 주세요." : "파일 오류를 확인해 주세요."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[980px]`}>
              <colgroup>
                <col className="w-[64px]" />
                <col />
                <col className="w-[112px]" />
                <col className="w-[240px]" />
                <col className="w-[200px]" />
                <col className="w-[96px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["번호", "과제명(파일)", "원장 매칭", "바뀐 블록", "위험", "상태"].map((h) => (
                    <th key={h} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((v) => {
                  const changed = v.plan ? v.plan.blocks.filter((b: SyncPlan["blocks"][number]) => b.status !== "same").map((b: SyncPlan["blocks"][number]) => SHORT[b.key]) : [];
                  const on = sel?.id === v.id;
                  return (
                    <tr key={v.id} className={on ? T.rowOn : T.row}>
                      <td className={`${T.td} font-mono text-ui text-navy`}>{v.task_no ?? "—"}</td>
                      <td className={`${T.td} truncate`} title={`${v.title ?? ""} · ${fileName(v.file_n)}`}>
                        <Link href={`${base}?item=${v.id}`} scroll={false} className="font-semibold text-ink no-underline hover:underline" data-keep-peek>
                          {v.title ?? "(과제명 없음)"}
                        </Link>
                      </td>
                      <td className={T.td}>{v.match === "exact" ? <Tag tone="navy">확정</Tag> : v.match === "uncertain" ? <Tag tone="warn">불확실</Tag> : <Tag tone="warnSolid">미존재</Tag>}</td>
                      <td className={`${T.td} truncate text-ui`} title={changed.join(", ")}>
                        {v.status !== "pending" ? <span className="text-muted">—</span> : v.plan ? changed.length ? changed.join(" · ") : <span className="text-muted">변경 없음</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className={`${T.td} truncate text-ui text-warn`} title={v.plan?.risks.join("\n")}>
                        {v.status === "pending" && v.plan?.risks.length ? v.plan.risks[0] + (v.plan.risks.length > 1 ? ` 외 ${v.plan.risks.length - 1}` : "") : ""}
                      </td>
                      <td className={T.td}>
                        {v.status === "applied" ? <Tag tone="navy">반영</Tag> : v.status === "skipped" ? <Tag title={v.result?.reason}>건너뜀</Tag> : v.status === "failed" ? <Tag tone="warn">실패</Tag> : <Tag tone="warnSolid">대기</Tag>}
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
