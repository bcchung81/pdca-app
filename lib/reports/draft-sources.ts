// 경평 초안 근거 합치기(순수 — 화면·서버 공용, 2026-10-29 「초안을 쓴 뒤 첨부한 파일로 초안 고치기」).
// 구성안대로 집필·자료 반영 고치기·블록 고치기·모양 바꾸기는 저장된 근거(구성안 sources·초안 spec.sources)에 지금 고른 근거(새 첨부 포함)를 더해 씀 —
// 사람이 뺀 자료(근거 자료 패널·첨부 칩 ✕)는 저장된 근거에 있어도 넣지 않음. 전년 절은 저장된 것 그대로(구성안·초안의 짜임 근거라 바꾸지 않음).
// 받은 id가 이 카드의 자료인지는 서버(app/(app)/reports/cards/draft-prepare.ts prepareDraft — card_materials.card_id·같은 보고서)가 DB로 다시 확인함.

/** 근거 id(카드 전용 자료·보고서 추가자료·전년 절 조각 키) — draft-prepare.ts DraftSources와 같은 모양 */
export interface SourceIds {
  card: string[];
  report: string[];
  /** 없으면(undefined) 서버가 자동으로 고름 */
  prior?: string[];
}

/** 화면이 보내는 지금 고른 근거: 넣을 자료(빼지 않은 것) + 뺀 자료 */
export interface DraftPick {
  card: string[];
  report: string[];
  off?: { card: string[]; report: string[] };
}

/** 받은 근거 고르기 상한(자료 수·id 길이 — 서버가 받는 값의 크기만 막음) */
const PICK_MAX = 300;
const ID_MAX = 80;

const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= ID_MAX))].slice(0, PICK_MAX) : []);

/** 서버 액션이 받은 값(공개 API처럼 — 모양이 틀리면 없는 것으로) */
export function readPick(v: unknown): DraftPick | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { card?: unknown; report?: unknown; off?: { card?: unknown; report?: unknown } | null };
  const off = o.off && typeof o.off === "object" ? { card: ids(o.off.card), report: ids(o.off.report) } : undefined;
  return { card: ids(o.card), report: ids(o.report), ...(off ? { off } : {}) };
}

/** 고른 상태 → 보낼 값(화면: sel.card·sel.report는 넣을 자료, off는 「c:<id>」·「r:<id>」 열쇠) */
export function pickOf(card: string[], report: string[], off: Iterable<string>): DraftPick {
  const keys = [...off];
  return { card, report, off: { card: keys.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)), report: keys.filter((k) => k.startsWith("r:")).map((k) => k.slice(2)) } };
}

export interface MergedSources {
  sources: SourceIds;
  /** 저장된 근거에 없던 자료(새로 더해짐) */
  added: { card: string[]; report: string[] };
  /** 저장된 근거 중 남긴 것 수(뺀 자료 제외) */
  kept: number;
}

/**
 * 저장된 근거 ∪ 지금 고른 근거 − 뺀 자료. pick이 없으면 저장된 근거 그대로(예전 호출 — 구성안 패널 등).
 * 순서는 저장된 근거 먼저, 그 뒤 새 자료(요청 글의 첨부 번호가 예전과 같게)
 */
export function mergeSources(saved: SourceIds | null | undefined, pick: DraftPick | null | undefined): MergedSources {
  const base = { card: saved?.card ?? [], report: saved?.report ?? [] };
  const prior = saved?.prior ? { prior: saved.prior } : {};
  if (!pick) return { sources: { ...base, ...prior }, added: { card: [], report: [] }, kept: base.card.length + base.report.length };
  const one = (old: string[], now: string[], off: string[] = []) => {
    const out = new Set(off);
    const had = new Set(old);
    const all = [...new Set([...old, ...now])].filter((id) => !out.has(id));
    return { all, added: all.filter((id) => !had.has(id)), kept: all.filter((id) => had.has(id)).length };
  };
  const c = one(base.card, pick.card, pick.off?.card);
  const r = one(base.report, pick.report, pick.off?.report);
  return { sources: { card: c.all, report: r.all, ...prior }, added: { card: c.added, report: r.added }, kept: c.kept + r.kept };
}

/**
 * 찾지 못한 자료 id — 이 카드의 자료가 아니거나(다른 카드·다른 보고서 id) 지워진 것. loose에 든 id(저장된 근거 — 그 뒤 지웠을 수 있음)는 빼고 셈.
 * 서버는 하나라도 있으면 아무것도 쓰지 않고 거절함(draft-prepare.ts prepareDraft)
 */
export function missingSources(want: Pick<SourceIds, "card" | "report">, found: Pick<SourceIds, "card" | "report">, loose?: Pick<SourceIds, "card" | "report"> | true): string[] {
  if (loose === true) return [];
  const miss = (w: string[], f: string[], l: string[] = []) => {
    const got = new Set([...f, ...l]);
    return w.filter((id) => !got.has(id));
  };
  return [...miss(want.card, found.card, loose?.card), ...miss(want.report, found.report, loose?.report)];
}

/** 초안 spec의 근거 목록 → id(블록 고치기·모양 바꾸기가 쓰는 저장된 근거) */
export function specSources(sources: Array<{ kind: string; id: string }> | undefined, priorKeys?: string[]): SourceIds {
  const s = sources ?? [];
  return { card: s.filter((x) => x.kind === "card").map((x) => x.id), report: s.filter((x) => x.kind === "report").map((x) => x.id), prior: priorKeys ?? s.filter((x) => x.kind === "prior").map((x) => x.id) };
}

/**
 * 블록 고치기로 새 자료를 썼으면 초안 근거 목록에도 더함(첨부 뒤에 — 다음 직접 고침·되돌리기의 숫자 대조가 그 자료를 근거로 씀). 이미 있는 자료·뺀 자료는 그대로 둠
 */
export function withFileSources<T extends { kind: string; id: string; name: string }>(sources: T[] | undefined, files: Array<{ kind: "card" | "report"; id: string; name: string }>): T[] | undefined {
  const s = sources ?? [];
  const have = new Set(s.map((x) => `${x.kind}:${x.id}`));
  const extra = files.filter((f) => !have.has(`${f.kind}:${f.id}`)).map((f) => ({ kind: f.kind, id: f.id, name: f.name }) as T);
  if (!extra.length) return sources;
  const lastFile = s.reduce((at, x, i) => (x.kind === "card" || x.kind === "report" ? i : at), -1);
  return [...s.slice(0, lastFile + 1), ...extra, ...s.slice(lastFile + 1)];
}

/** 집필 요청의 「구성안 뒤 추가된 자료」·「담당자 요청」(report-draft·report-draft-mg request.md plan.added·plan.request) — 둘 다 없으면 null */
export interface PlanRevise {
  /** 구성안에 저장된 근거에 없던 첨부 이름(읽은 것만 — 못 읽은 자료는 경고로 남음) */
  added: string[];
  /** 담당자가 요청 칸에 쓴 글(집필 지시일 뿐 근거 아님) */
  request: string;
}
