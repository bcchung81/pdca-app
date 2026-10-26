// 경평 초안 팔 비교(scripts/eval/compare-report.ts)의 모으기·집계 — 입출력 없는 순수 함수(평균·짝 승수·스피어만·피어슨·결함 표).
// 값이 없는 지표는 null로 두고(지어내지 않음) 화면이 빈칸으로 그린다.
import { gradeWarnings } from "../../lib/reports/warning-levels.ts";

export interface Arm {
  id: string;
  label: string;
  provider?: string;
  model?: string;
  effort?: string;
}

export interface ManifestDraft {
  name: string;
  arm: string;
  card: string;
  run: number | string;
  ok?: boolean;
  error?: string | null;
  durationMs?: number | null;
  outlineMs?: number | null;
  draftMs?: number | null;
  usage?: { input?: number; output?: number; cached?: number } | null;
  retries?: number | null;
  /** 있으면 쓰는 선택 칸(새 라운드 산출에 담길 수 있음) */
  warnings?: string[];
  unknownNumbers?: string[];
}

export interface Manifest {
  round?: string;
  createdAt?: string;
  arms: Arm[];
  drafts: ManifestDraft[];
}

export interface JudgeDraft {
  id: string;
  scores: Record<string, number>;
  overall: number | null;
  best?: string;
  flaw?: string;
  fix?: string;
  fabrications?: string[];
}

export interface JudgeFile {
  judge: string;
  drafts: JudgeDraft[];
  ranking: string[];
  commonFlaws: { flaw: string; drafts: string[]; cause: string }[];
}

/** 결정론 점수 기록(eval-report-score.ts records[]) 중 쓰는 칸만 */
export interface ScoreRecord {
  file: string;
  id?: string;
  fitEstimate?: { total: number; budget: number } | null;
  groundWeak?: { weakShare: number } | null;
  lensCover?: { count: number } | null;
  diagrams?: { distinct: number } | null;
}

export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function mean(xs: readonly (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** 값 → 순위(1부터, 같은 값은 평균 순위) */
export function ranksOf(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const out: number[] = new Array(xs.length);
  for (let s = 0; s < order.length; ) {
    let e = s;
    while (e + 1 < order.length && order[e + 1].x === order[s].x) e++;
    for (let k = s; k <= e; k++) out[order[k].i] = (s + e) / 2 + 1;
    s = e + 1;
  }
  return out;
}

export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  return pearson(ranksOf(xs.slice(0, n)), ranksOf(ys.slice(0, n)));
}

// ───────────── 읽기(느슨한 JSON → 형식) ─────────────

export function parseManifest(raw: unknown): Manifest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arms = (Array.isArray(r.arms) ? r.arms : []).map((a: Record<string, unknown>) => ({
    id: str(a.id),
    label: str(a.label) || str(a.id),
    provider: str(a.provider) || undefined,
    model: str(a.model) || undefined,
    effort: str(a.effort) || undefined,
  }));
  const drafts = (Array.isArray(r.drafts) ? r.drafts : []).map((d: Record<string, unknown>) => ({
    name: str(d.name),
    arm: str(d.arm),
    card: str(d.card),
    run: typeof d.run === "number" || typeof d.run === "string" ? d.run : 1,
    ok: d.ok === false ? false : true,
    error: typeof d.error === "string" ? d.error : null,
    durationMs: num(d.durationMs),
    outlineMs: num(d.outlineMs),
    draftMs: num(d.draftMs),
    usage: d.usage && typeof d.usage === "object" ? (d.usage as ManifestDraft["usage"]) : null,
    retries: num(d.retries),
    warnings: Array.isArray(d.warnings) ? (d.warnings as unknown[]).map(String) : undefined,
    unknownNumbers: Array.isArray(d.unknownNumbers) ? (d.unknownNumbers as unknown[]).map(String) : undefined,
  }));
  return { round: str(r.round) || undefined, createdAt: str(r.createdAt) || undefined, arms, drafts };
}

export function parseJudge(raw: unknown, fallbackName: string): JudgeFile {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    judge: str(r.judge) || fallbackName,
    drafts: (Array.isArray(r.drafts) ? r.drafts : []).map((d: Record<string, unknown>) => ({
      id: str(d.id),
      scores: Object.fromEntries(Object.entries((d.scores ?? {}) as Record<string, unknown>).flatMap(([k, v]) => (num(v) === null ? [] : [[k, v as number]]))),
      overall: num(d.overall),
      best: str(d.best) || undefined,
      flaw: str(d.flaw) || undefined,
      fix: str(d.fix) || undefined,
      fabrications: Array.isArray(d.fabrications) ? (d.fabrications as unknown[]).map(String) : undefined,
    })),
    ranking: Array.isArray(r.ranking) ? (r.ranking as unknown[]).map(String) : [],
    commonFlaws: (Array.isArray(r.common_flaws) ? r.common_flaws : []).map((f: Record<string, unknown>) => ({
      flaw: str(f.flaw),
      drafts: Array.isArray(f.drafts) ? (f.drafts as unknown[]).map(String) : [],
      cause: str(f.cause),
    })),
  };
}

/** 이름 앞머리(O-·N-·V0 …)로 팔·변형을 나눔 — 과거 라운드(manifest 없음) 대체 경로. 모르는 모양이면 null */
export function armFromName(name: string): { arm: string; slot: string } | null {
  const m = /^([A-Za-z]+)-(.+)$/.exec(name);
  if (m) return { arm: m[1], slot: m[2] };
  const v = /^([A-Za-z]+\d+)$/.exec(name);
  return v ? { arm: v[1], slot: v[1] } : null;
}

export function manifestFromNames(entries: { name: string; card: string }[]): Manifest {
  const arms: Arm[] = [];
  const drafts: ManifestDraft[] = [];
  for (const e of entries) {
    const p = armFromName(e.name);
    if (!p) continue;
    if (!arms.some((a) => a.id === p.arm)) arms.push({ id: p.arm, label: `${p.arm} (이름 앞머리로 나눈 팔)` });
    drafts.push({ name: e.name, arm: p.arm, card: e.card, run: p.slot });
  }
  return { arms, drafts };
}

// ───────────── 초안 한 건의 모음 ─────────────

export interface DraftInfo {
  name: string;
  arm: string;
  card: string;
  slot: string;
  ok: boolean;
  error: string | null;
  manifest: ManifestDraft | null;
  unknownNumbers: string[] | null;
  warnings: string[] | null;
  /** 결정론 지표(없으면 null) */
  fill: number | null;
  weakShare: number | null;
  lens: number | null;
  distinct: number | null;
}

export interface DraftSource {
  manifest: ManifestDraft;
  /** 초안 파일을 읽었는가(없으면 생성 실패 취급이 아니라 「초안 없음」) */
  hasFile: boolean;
  unknownNumbers: string[] | null;
  warnings: string[] | null;
}

/** 점수 기록들(여러 파일 합침) → 초안 이름별 기록. file은 「이름.html.json」 */
export function scoreIndex(sets: { prefix: string; records: ScoreRecord[] }[]): Map<string, ScoreRecord> {
  const m = new Map<string, ScoreRecord>();
  for (const s of sets) for (const r of s.records) m.set(s.prefix + r.file.replace(/\.html\.json$/, "").replace(/\.json$/, ""), r);
  return m;
}

export function collectDrafts(sources: DraftSource[], scores: Map<string, ScoreRecord>): DraftInfo[] {
  return sources.map((s) => {
    const md = s.manifest;
    const sc = scores.get(md.name);
    const ok = md.ok !== false && s.hasFile;
    const total = num(sc?.fitEstimate?.total);
    const budget = num(sc?.fitEstimate?.budget);
    return {
      name: md.name,
      arm: md.arm,
      card: md.card,
      slot: String(md.run),
      ok,
      error: ok ? null : md.error || (md.ok === false ? "생성 실패(오류 문구 없음)" : "초안 파일 없음"),
      manifest: md,
      unknownNumbers: s.unknownNumbers ?? md.unknownNumbers ?? null,
      warnings: s.warnings ?? md.warnings ?? null,
      fill: total !== null && budget ? total / budget : null,
      weakShare: num(sc?.groundWeak?.weakShare),
      lens: num(sc?.lensCover?.count),
      distinct: num(sc?.diagrams?.distinct),
    };
  });
}

// ───────────── 심사 ─────────────

export type JudgeKey = Record<string, string>;

/** 초안 이름 → 심사자 → 심사 한 건 */
export function judgedByName(judges: JudgeFile[], key: JudgeKey): Map<string, Map<string, JudgeDraft>> {
  const m = new Map<string, Map<string, JudgeDraft>>();
  for (const j of judges)
    for (const d of j.drafts) {
      const name = key[d.id];
      if (!name) continue;
      if (!m.has(name)) m.set(name, new Map());
      m.get(name)!.set(j.judge, d);
    }
  return m;
}

/** 루브릭 축(심사 파일에 처음 나온 순서) */
export function axesOf(judges: JudgeFile[]): string[] {
  const axes: string[] = [];
  for (const j of judges) for (const d of j.drafts) for (const a of Object.keys(d.scores)) if (!axes.includes(a)) axes.push(a);
  return axes;
}

export interface Scored {
  overall: number | null;
  axes: Record<string, number | null>;
}

/** 한 초안의 심사 평균(심사자 동등) */
export function draftScore(judged: Map<string, JudgeDraft> | undefined, axes: string[]): Scored {
  const list = judged ? [...judged.values()] : [];
  return { overall: mean(list.map((d) => d.overall)), axes: Object.fromEntries(axes.map((a) => [a, mean(list.map((d) => d.scores[a]))])) };
}

export interface ArmScoreRow {
  arm: string;
  /** 심사받은 초안 수 */
  n: number;
  byJudge: Record<string, Scored & { n: number }>;
  mean: Scored;
}

/** 팔별 종합 점수 — 심사자별 평균과, 심사자 평균을 다시 평균한 값(심사자 동등) */
export function armScores(arms: Arm[], drafts: DraftInfo[], judged: Map<string, Map<string, JudgeDraft>>, judgeNames: string[], axes: string[]): ArmScoreRow[] {
  return arms.map((arm) => {
    const mine = drafts.filter((d) => d.arm === arm.id && judged.has(d.name));
    const byJudge: ArmScoreRow["byJudge"] = {};
    for (const jn of judgeNames) {
      const ds = mine.map((d) => judged.get(d.name)!.get(jn)).filter((x): x is JudgeDraft => Boolean(x));
      byJudge[jn] = { n: ds.length, overall: mean(ds.map((d) => d.overall)), axes: Object.fromEntries(axes.map((a) => [a, mean(ds.map((d) => d.scores[a]))])) };
    }
    const present = judgeNames.map((jn) => byJudge[jn]).filter((b) => b.n > 0);
    return {
      arm: arm.id,
      n: mine.length,
      byJudge,
      mean: { overall: mean(present.map((b) => b.overall)), axes: Object.fromEntries(axes.map((a) => [a, mean(present.map((b) => b.axes[a]))])) },
    };
  });
}

export interface PairRow {
  a: string;
  b: string;
  /** 짝(같은 카드·같은 회차에 두 팔 모두 점수가 있는 것) 수 */
  n: number;
  aWins: number;
  bWins: number;
  ties: number;
  byJudge: Record<string, { n: number; aWins: number; bWins: number; ties: number }>;
}

/** 같은 카드·같은 회차끼리 팔 짝 승수 — 평균 점수 기준과 심사자별 기준 */
export function pairedWins(arms: Arm[], drafts: DraftInfo[], judged: Map<string, Map<string, JudgeDraft>>, judgeNames: string[]): PairRow[] {
  // (카드, 회차, 팔) → 초안 이름들
  const cell = new Map<string, string[]>();
  for (const d of drafts) {
    if (!d.ok || !judged.has(d.name)) continue;
    const k = JSON.stringify([d.card, d.slot, d.arm]);
    cell.set(k, [...(cell.get(k) ?? []), d.name]);
  }
  const slots = [...new Set(drafts.map((d) => JSON.stringify([d.card, d.slot])))];
  const scoreOf = (names: string[], jn: string | null): number | null =>
    mean(names.map((nm) => (jn === null ? mean([...judged.get(nm)!.values()].map((x) => x.overall)) : (judged.get(nm)!.get(jn)?.overall ?? null))));
  const rows: PairRow[] = [];
  for (let i = 0; i < arms.length; i++)
    for (let j = i + 1; j < arms.length; j++) {
      const row: PairRow = { a: arms[i].id, b: arms[j].id, n: 0, aWins: 0, bWins: 0, ties: 0, byJudge: Object.fromEntries(judgeNames.map((jn) => [jn, { n: 0, aWins: 0, bWins: 0, ties: 0 }])) };
      for (const s of slots) {
        const [card, slot] = JSON.parse(s) as [string, string];
        const an = cell.get(JSON.stringify([card, slot, arms[i].id]));
        const bn = cell.get(JSON.stringify([card, slot, arms[j].id]));
        if (!an || !bn) continue;
        const tally = (t: { n: number; aWins: number; bWins: number; ties: number }, jn: string | null) => {
          const x = scoreOf(an, jn);
          const y = scoreOf(bn, jn);
          if (x === null || y === null) return;
          t.n++;
          if (Math.abs(x - y) < 1e-9) t.ties++;
          else if (x > y) t.aWins++;
          else t.bWins++;
        };
        tally(row, null);
        for (const jn of judgeNames) tally(row.byJudge[jn], jn);
      }
      rows.push(row);
    }
  return rows;
}

export interface Agreement {
  a: string;
  b: string;
  common: number;
  spearman: number | null;
  pearson: number | null;
}

/** 심사자 짝마다 — 둘 다 순위에 넣은 초안끼리 다시 순위 매겨 스피어만, 둘 다 종합을 준 초안끼리 피어슨 */
export function agreements(judges: JudgeFile[], key: JudgeKey): Agreement[] {
  const out: Agreement[] = [];
  for (let i = 0; i < judges.length; i++)
    for (let j = i + 1; j < judges.length; j++) {
      const A = judges[i];
      const B = judges[j];
      const posA = new Map(A.ranking.map((id, p) => [key[id], p + 1] as const).filter(([n]) => n));
      const posB = new Map(B.ranking.map((id, p) => [key[id], p + 1] as const).filter(([n]) => n));
      const common = [...posA.keys()].filter((n) => posB.has(n));
      const ovA = new Map(A.drafts.flatMap((d) => (key[d.id] && d.overall !== null ? [[key[d.id], d.overall] as const] : [])));
      const ovB = new Map(B.drafts.flatMap((d) => (key[d.id] && d.overall !== null ? [[key[d.id], d.overall] as const] : [])));
      const both = [...ovA.keys()].filter((n) => ovB.has(n));
      out.push({
        a: A.judge,
        b: B.judge,
        common: Math.max(common.length, both.length),
        spearman: spearman(common.map((n) => posA.get(n)!), common.map((n) => posB.get(n)!)),
        pearson: pearson(both.map((n) => ovA.get(n)!), both.map((n) => ovB.get(n)!)),
      });
    }
  return out;
}

export interface FlawRow {
  judge: string;
  flaw: string;
  cause: string;
  byArm: Record<string, number>;
  total: number;
}

/** 공통 결함 — 심사자·결함마다 팔별 건수(키에 없는 초안은 세지 않음) */
export function flawTable(judges: JudgeFile[], key: JudgeKey, drafts: DraftInfo[], arms: Arm[]): FlawRow[] {
  const armOf = new Map(drafts.map((d) => [d.name, d.arm]));
  const rows: FlawRow[] = [];
  for (const j of judges)
    for (const f of j.commonFlaws) {
      const byArm = Object.fromEntries(arms.map((a) => [a.id, 0]));
      for (const id of f.drafts) {
        const arm = armOf.get(key[id]);
        if (arm !== undefined && arm in byArm) byArm[arm]++;
      }
      rows.push({ judge: j.judge, flaw: f.flaw, cause: f.cause, byArm, total: Object.values(byArm).reduce((a, b) => a + b, 0) });
    }
  return rows.sort((x, y) => y.total - x.total || (x.flaw < y.flaw ? -1 : x.flaw > y.flaw ? 1 : 0));
}

// ───────────── 결정론 지표 ─────────────

export interface DetRow {
  arm: string;
  drafts: number;
  failed: number | null;
  unknownNumbers: number | null;
  blockWarnings: number | null;
  infoWarnings: number | null;
  fill: number | null;
  weakShare: number | null;
  lens: number | null;
  distinct: number | null;
  retries: number | null;
  durationSec: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}

/** 팔별 평균 — 값이 있는 초안만 평균하고, 하나도 없으면 null(칸 비움). 생성 실패는 manifest가 있을 때만 */
export function detMetrics(arms: Arm[], drafts: DraftInfo[], hasManifest: boolean): DetRow[] {
  return arms.map((arm) => {
    const mine = drafts.filter((d) => d.arm === arm.id);
    const okOnes = mine.filter((d) => d.ok);
    const md = mine.map((d) => d.manifest).filter((m): m is ManifestDraft => Boolean(m));
    const graded = okOnes.filter((d) => d.warnings).map((d) => gradeWarnings(d.warnings!));
    const durationMs = mean(md.map((m) => m.durationMs));
    const usageOf = (k: "input" | "output" | "cached") => mean(md.map((m) => num(m.usage?.[k])));
    return {
      arm: arm.id,
      drafts: mine.length,
      failed: hasManifest ? mine.filter((d) => !d.ok).length : null,
      unknownNumbers: mean(okOnes.filter((d) => d.unknownNumbers).map((d) => d.unknownNumbers!.length)),
      blockWarnings: mean(graded.map((g) => g.filter((w) => w.level === "block").length)),
      infoWarnings: mean(graded.map((g) => g.filter((w) => w.level === "info").length)),
      fill: mean(okOnes.map((d) => d.fill)),
      weakShare: mean(okOnes.map((d) => d.weakShare)),
      lens: mean(okOnes.map((d) => d.lens)),
      distinct: mean(okOnes.map((d) => d.distinct)),
      retries: hasManifest ? mean(md.map((m) => m.retries)) : null,
      durationSec: hasManifest && durationMs !== null ? durationMs / 1000 : null,
      inputTokens: usageOf("input"),
      outputTokens: usageOf("output"),
      cachedTokens: usageOf("cached"),
    };
  });
}

/** 팔 설정이 서로 다를 때 붙이는 비대칭 주석(manifest 값 그대로) — 같으면 null */
export function asymmetryNote(arms: Arm[]): string | null {
  const efforts = arms.filter((a) => a.effort);
  const parts: string[] = [];
  if (new Set(efforts.map((a) => a.effort)).size > 1) parts.push(`effort가 팔마다 다릅니다(${efforts.map((a) => `${a.id}=${a.effort}`).join(" · ")})`);
  const providers = arms.filter((a) => a.provider);
  if (new Set(providers.map((a) => a.provider)).size > 1) parts.push(`호출 경로가 팔마다 다릅니다(${providers.map((a) => `${a.id}=${a.provider}`).join(" · ")})`);
  return parts.length ? `${parts.join(", ")}. 같은 effort 이름이라도 모델마다 뜻이 달라, 이 비교는 「모델 + 설정 묶음」끼리의 비교입니다.` : null;
}

/**
 * 평가 폴더의 findings.html(메인이 쓴 신뢰된 HTML 조각)을 제목 아래 절로 감싼다.
 * 조각이 없으면(null·빈 문자열) 빈 문자열을 돌려줘, 끼운 뒤에도 출력이 예전과 바이트까지 같다.
 * 조각은 이스케이프하지 않는다(로컬에서 만든 신뢰된 입력).
 */
export function findingsSection(fragment: string | null | undefined): string {
  if (!fragment || !fragment.trim()) return "";
  return `<section class="cmp-findings" id="findings">${fragment}</section>\n`;
}


export interface RoundFiltered {
  manifest: Manifest;
  judges: JudgeFile[];
  key: JudgeKey;
  /** 거른 팔 id(없으면 빈 배열) */
  dropped: string[];
  /** 원 라운드 팔 수 */
  originalArms: number;
}

/**
 * 지정한 팔만 남기도록 manifest·심사 파일·심사 키를 거른다(--arms). arms가 없으면 입력을 그대로 돌려줘 출력이 예전과 같다.
 * 걸러진 팔 초안의 번호(D01…)는 키·심사 초안·순위·공통 결함에서 빠지므로, 뒤 집계(점수·짝 승수·일치도·결함표)가 자동으로 남은 팔만 본다.
 * 남은 초안이 하나도 없는 공통 결함 행은 뺀다. 목록에 없는 팔 id는 오류.
 */
export function filterRound(manifest: Manifest, judges: JudgeFile[], key: JudgeKey, arms: readonly string[] | null | undefined): RoundFiltered {
  const originalArms = manifest.arms.length;
  if (!arms || arms.length === 0) return { manifest, judges, key, dropped: [], originalArms };
  const unknown = arms.filter((a) => !manifest.arms.some((x) => x.id === a));
  if (unknown.length) throw new Error(`--arms에 없는 팔: ${unknown.join(", ")} (있는 팔: ${manifest.arms.map((a) => a.id).join(", ")})`);
  const keep = new Set(arms);
  const keptDrafts = manifest.drafts.filter((d) => keep.has(d.arm));
  const keptNames = new Set(keptDrafts.map((d) => d.name));
  const goneNames = new Set(manifest.drafts.filter((d) => !keep.has(d.arm)).map((d) => d.name));
  const newKey: JudgeKey = Object.fromEntries(Object.entries(key).filter(([, n]) => !goneNames.has(n)));
  const alive = (id: string) => id in newKey || !(id in key);
  const newJudges: JudgeFile[] = judges.map((j) => ({
    judge: j.judge,
    drafts: j.drafts.filter((d) => alive(d.id)),
    ranking: j.ranking.filter(alive),
    commonFlaws: j.commonFlaws.map((f) => ({ ...f, drafts: f.drafts.filter(alive) })).filter((f) => f.drafts.some((id) => id in newKey && keptNames.has(newKey[id]))),
  }));
  return {
    manifest: { ...manifest, arms: manifest.arms.filter((a) => keep.has(a.id)), drafts: keptDrafts },
    judges: newJudges,
    key: newKey,
    dropped: manifest.arms.filter((a) => !keep.has(a.id)).map((a) => a.id),
    originalArms,
  };
}
