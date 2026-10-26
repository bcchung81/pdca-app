import "server-only";

import { createClient } from "../supabase/server.ts";
import { type CardLayout, layoutImageKeys } from "../hwp/layout.ts";
import { cardImageRefs } from "./original-html.ts";
import { type FinalInspectionView, type JudgeStatus, finalInspection, finalInspectionView, isVerdict, judgeStatus, readResult } from "../inspections/model.ts";
import { compareTaskNo, compareUnitId, currentPeriod } from "./view.ts";
import { DEFAULT_TRACK, type TrackId } from "../tracks/index.ts";

export type WorkStatus = "진행중" | "완료" | "보류";

interface InspectionBrief {
  id: number;
  card_id: string;
  period: string;
  status: string;
  verdict: string | null;
}

/** 과제별 최종 점검현황(목록 「AI 컨설팅」) — 부서 담당자는 RLS로 초안이 오지 않아 받은 것만으로 셈 */
async function finalInspections(supabase: Awaited<ReturnType<typeof createClient>>, rows: InspectionBrief[]): Promise<Map<string, FinalInspectionView | null>> {
  const byCard = new Map<string, InspectionBrief[]>();
  for (const r of rows) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);
  const picked = new Map([...byCard].map(([id, list]) => [id, finalInspection(list)]));
  const verdicts = new Map<number, JudgeStatus>();
  for (const { final } of picked.values()) if (final && isVerdict(final.verdict)) verdicts.set(final.id, final.verdict);
  const missing = [...picked.values()].flatMap(({ final }) => (final && !verdicts.has(final.id) ? [final.id] : []));
  if (missing.length) {
    const { data } = await supabase.from("inspections").select("id, result").in("id", missing);
    for (const r of data ?? []) verdicts.set(r.id, judgeStatus(readResult(r.result)));
  }
  const current = currentPeriod();
  return new Map(
    [...picked].map(([id, { final, draft }]) => [id, finalInspectionView(final && { ...final, verdict: verdicts.get(final.id) ?? null }, draft, current)]),
  );
}
export type Stage = "Plan" | "Do" | "Check" | "Act";

/** 목록 한 줄 = Notion 주요사업 DB 속성(과제명·대상사업·과제번호·부서명·담당자·과제구분·PDCA 단계·진도율·상태·AI 컨설팅·수정일자) */
export interface CardRow {
  id: string;
  uid: string;
  evalUnitId: string;
  business: string;
  taskNo: string;
  title: string;
  department: string;
  teamId: number | null;
  team: string | null;
  person: string;
  kind: "신규과제" | "고도화과제" | null;
  stage: Stage | null;
  progress: number | null;
  workStatus: WorkStatus;
  /** AI 컨설팅(최종 점검현황): 부서에 보낸·확인한 점검 중 점검월이 가장 늦은 1건 + 그보다 늦은 초안(성과관리팀만 보임) */
  inspection: FinalInspectionView | null;
  updatedAt: string;
  /** 고정 영역 확정됨(카드 종류별 구역 — lib/cards/fixed.ts) */
  fixedLocked: boolean;
}

/**
 * 로그인 사용자가 볼 수 있는 카드(RLS: 성과관리팀·관리자는 모든 과제, 부서 담당자는 자기에게 지정된 과제만).
 * assigneeId를 주면 그 사용자에게 지정된 과제만 — 부서 담당자 「내 과제」는 RLS와 별개로 이 조건을 명시해 지정 표(card_assignees)를 그대로 따름
 */
export async function listCards(filter: { evalUnitId?: string; teamId?: number; assigneeId?: string; q?: string; track?: TrackId } = {}): Promise<CardRow[]> {
  const supabase = await createClient();
  let assigned: string[] | null = null;
  if (filter.assigneeId) {
    const { data: mine, error: mineError } = await supabase.from("card_assignees").select("card_id").eq("user_id", filter.assigneeId);
    if (mineError) throw new Error(`담당 과제: ${mineError.message}`);
    assigned = (mine ?? []).map((r) => r.card_id as string);
    if (assigned.length === 0) return [];
  }
  let query = supabase
    .from("cards")
    .select(
      "id, uid, eval_unit_id, task_no, title, hq, team_id, stage, progress, work_status, updated_at, fixed_locked_at, unit:eval_units!inner(name, track), team:teams(name), mgr:data->>manager, wr:data->>writer, checks:data->overview->checks, tags:data->tags",
    )
    .eq("status", "active")
    .eq("unit.track", filter.track ?? DEFAULT_TRACK.id); // 트랙을 안 정하면 주요사업 — 경영관리 카드가 주요사업 화면에 섞이지 않음
  if (filter.evalUnitId) query = query.eq("eval_unit_id", filter.evalUnitId);
  if (filter.teamId) query = query.eq("team_id", filter.teamId);
  if (assigned) query = query.in("id", assigned);
  const [{ data, error }, { data: inspections }] = await Promise.all([
    query,
    // 판정은 저장할 때 둔 요약(result.summary)만 읽음 — 점검표 전체는 요약이 없는 옛 행의 최종 1건만 따로 읽음
    supabase.from("inspections").select("id, card_id, period, status, verdict:result->summary->>verdict"),
  ]);
  if (error) throw new Error(`카드 목록: ${error.message}`);
  const inspection = await finalInspections(supabase, (inspections ?? []) as InspectionBrief[]);

  const q = filter.q?.trim().toLowerCase();
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (data ?? [])
    .map((c) => {
      const checks = (c.checks ?? {}) as { new?: boolean; advanced?: boolean };
      const isNew = checks.new || (c.tags as { new?: boolean } | null)?.new;
      return {
        id: c.id,
        uid: c.uid,
        evalUnitId: c.eval_unit_id,
        business: one(c.unit)?.name ?? "",
        taskNo: c.task_no,
        title: c.title,
        department: c.hq ?? "",
        teamId: c.team_id,
        team: one(c.team)?.name ?? null,
        person: [c.mgr, c.wr].filter(Boolean).join(" / "),
        kind: isNew ? "신규과제" : checks.advanced ? "고도화과제" : null,
        stage: (c.stage as Stage | null) ?? null,
        progress: c.progress,
        workStatus: c.work_status as WorkStatus,
        inspection: inspection.get(c.id) ?? null,
        updatedAt: c.updated_at,
        fixedLocked: Boolean(c.fixed_locked_at),
      } satisfies CardRow;
    })
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.taskNo.includes(q) || c.person.toLowerCase().includes(q) || (c.team ?? "").includes(q))
    .sort((a, b) => compareUnitId(a.evalUnitId, b.evalUnitId) || compareTaskNo(a.taskNo, b.taskNo));
}

/** 원본 조각 그림의 서명 URL(1시간). 원래 src → 서명 URL. 원본 배치 그림은 「hwp:저장 이름」 → 서명 URL */
export async function signedImageUrls(uid: string, html: string, layoutKeys: string[] = []): Promise<Map<string, string>> {
  const refs = [...cardImageRefs(html).map((r) => ({ src: r.src, object: r.objectName })), ...layoutKeys.map((k) => ({ src: `hwp:${k}`, object: k }))];
  const urls = new Map<string, string>();
  if (!refs.length) return urls;
  const supabase = await createClient();
  const { data: signed } = await supabase.storage.from("card-originals").createSignedUrls(
    refs.map((r) => `${uid}/${r.object}`),
    3600,
  );
  refs.forEach((r, i) => {
    const url = signed?.[i]?.signedUrl;
    if (url) urls.set(r.src, url);
  });
  return urls;
}

const isUid = (uid: string) => /^[0-9a-f-]{36}$/i.test(uid);

/** 편집용: 카드 JSON + 운영 값 + 그림 서명 URL */
export async function getCardForEdit(uid: string) {
  if (!isUid(uid)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cards")
    .select("id, uid, task_no, title, edition, data, original_html, layout, stage, progress, work_status, updated_at, fixed_locked_at, team_id, data_rev, status, retired_reason")
    .eq("uid", uid)
    .maybeSingle();
  if (!data) return null;
  const layout = (data.layout as CardLayout | null) ?? null;
  const urls = await signedImageUrls(data.uid, data.original_html ?? "", layoutImageKeys(layout));
  return {
    id: data.id as string,
    uid: data.uid as string,
    taskNo: data.task_no as string,
    title: data.title as string,
    edition: data.edition as string,
    data: data.data as Record<string, unknown>,
    stage: (data.stage as Stage | null) ?? null,
    progress: data.progress as number | null,
    workStatus: data.work_status as WorkStatus,
    updatedAt: data.updated_at as string,
    fixedLockedAt: (data.fixed_locked_at as string | null) ?? null,
    teamId: (data.team_id as number | null) ?? null,
    dataRev: (data.data_rev as number) ?? 0,
    retired: data.status === "retired",
    retiredReason: (data.retired_reason as string | null) ?? null,
    imageUrls: Object.fromEntries(urls),
    /** 원본 배치(없으면 원본 양식 렌더러로 그림) */
    layout,
  };
}
