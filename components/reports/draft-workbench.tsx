"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Dispatch, type ReactNode, type SetStateAction, useState } from "react";
import { deleteCardMaterial, finishCardMaterialUpload, startCardMaterialUpload } from "../../app/(app)/cards/materials-actions";
import { FileDrop } from "../ui/file-drop";
import { T } from "../ui/kit";
import { useAsk } from "../ui/confirm-dialog";

/** 초안 근거로 고를 수 있는 첨부 자료 하나 */
export interface SourceFile {
  id: string;
  fileName: string;
  bytes: number | null;
  url: string | null;
  /** 올린 시각(지난 초안 뒤에 올린 자료는 기본으로 넣음) */
  createdAt: string;
  /** AI가 읽을 수 있는가(형식 밖이거나 읽기에 실패한 것만 false — 참고자료 설계 1단계) */
  attachable: boolean;
  /** AI가 못 읽은 사유(attachable이 false이고 형식은 맞을 때) */
  parseError: string | null;
  /** 읽은 글 수(읽었을 때) */
  chars: number | null;
  /**
   * 보고서 추가자료가 이 과제와 맺는 관계(참고자료 3단계): matched = 사람이 이 과제에 연결(확정)해 숫자 근거로 인정 ·
   * same-report = 연결 없음(같은 보고서 자료 — 넣되 숫자 근거 아님). 카드 전용 자료는 없음
   */
  relation?: "matched" | "same-report";
}

/** 근거 창의 관계 표지 글·색 */
const RELATION_TAG: Record<NonNullable<SourceFile["relation"]>, { text: string; title: string; cls: string }> = {
  matched: { text: "이 과제 자료", title: "이 과제에 연결해 확정한 자료 — 수치를 숫자 근거로 인정합니다", cls: "bg-info-bg text-link" },
  "same-report": { text: "같은 보고서 자료", title: "이 과제에 연결하지 않은 자료 — 초안에는 넣지만 수치는 숫자 근거로 인정하지 않습니다", cls: "bg-field text-muted-2" },
};

export const kb = (n: number | null) => (n == null ? "" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
/** 읽은 글 수(1만 자 이상은 「1.1만 자」, 미만은 「n자」) */
export const charsLabel = (n: number | null) => (n === null ? "" : n >= 10_000 ? `${(n / 10_000).toFixed(1)}만 자` : `${n}자`);

/** 근거 고르기 재료(서버가 넘김) */
export interface SourceProps {
  cardFiles: SourceFile[];
  /** null = 보고서 준비 전 */
  reportFiles: SourceFile[] | null;
  /** 지난 초안에 넣은 자료와 만든 시각(없으면 null — 모두 넣음) */
  used: { card: string[]; report: string[]; at: string } | null;
  /** 보고서 추가자료를 올리는 화면 */
  reportHref: string | null;
  /** 전년도 경영실적보고서 같은 과제 절(과거 실적): 같은 주요사업 절 모두(닮은 순) · 처음 고른 것(지난 초안에 쓴 것, 없으면 자동) · 자동 */
  prior: { options: Array<{ key: string; label: string; score: number; same: boolean }>; initial: string[]; auto: string[] };
  /** 평가 기준·평가위원 관점(공통 지식에서 앱이 자동으로 고름 — 묶음 이름·조각 제목) */
  lens: Array<{ group: string; title: string }>;
}

/** 고른 근거(AI 초안 탭의 요청 칸과 근거 자료 패널이 함께 씀) */
export interface DraftSelection {
  /** 넣을 카드 전용 자료·보고서 추가자료(AI가 읽는 형식 중 빼지 않은 것) */
  card: SourceFile[];
  report: SourceFile[];
  count: number;
  /** 뺀 자료 열쇠(c:<id>·r:<id>) */
  off: Set<string>;
  toggle: (key: string) => void;
  priorKeys: string[];
  setPriorKeys: Dispatch<SetStateAction<string[]>>;
}

/**
 * 근거 고르기 상태: 원장 카드(늘 넣음) + 카드 전용 자료 + 그 보고서 추가자료 + 전년 절.
 * 기본은 읽을 수 있는 자료 모두(지난 초안이 있으면 그때 쓴 자료, 그 뒤 올린 자료는 넣음) — 뺀 자료만 기억하므로 새로 올린 자료는 곧바로 들어감.
 */
export function useDraftSelection(p: SourceProps): DraftSelection {
  const [off, setOff] = useState<Set<string>>(() => {
    const used = p.used;
    if (!used) return new Set();
    const on = new Set([...used.card.map((id) => `c:${id}`), ...used.report.map((id) => `r:${id}`)]);
    const before = (f: SourceFile) => f.createdAt <= used.at;
    return new Set([...p.cardFiles.filter(before).map((f) => `c:${f.id}`), ...(p.reportFiles ?? []).filter(before).map((f) => `r:${f.id}`)].filter((k) => !on.has(k)));
  });
  const [priorKeys, setPriorKeys] = useState<string[]>(() => p.prior.initial.slice(0, 2));
  const picked = (kind: "c" | "r", files: SourceFile[]) => files.filter((f) => f.attachable && !off.has(`${kind}:${f.id}`));
  const card = picked("c", p.cardFiles);
  const report = picked("r", p.reportFiles ?? []);
  const toggle = (key: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  return { card, report, count: card.length + report.length, off, toggle, priorKeys, setPriorKeys };
}

/** 넣을 근거 한 줄(요청 칸·근거 자료 패널 공용) */
export const selectionLine = (sel: DraftSelection, lens: number) => `카드 · 첨부 ${sel.count}건${sel.priorKeys.length ? ` · 전년 절 ${sel.priorKeys.length}` : ""}${lens ? ` · 평가 근거 ${lens}` : ""}`;

/**
 * 경평 초안 과제별 초안 오른쪽 자리의 「근거 자료」 패널(과제원장 「자료」처럼 머리의 폴더 단추로 바꿔 열고 ✕·Esc로 탭에 돌아감):
 * 원장 카드(늘 넣음) · 전년 절 고르기 · 평가 기준 목록 · 카드 전용 자료 올리기·고르기 · 보고서 추가자료 고르기. 고른 상태는 AI 초안 탭과 같음.
 */
export function DraftSources(props: SourceProps & { uid: string; canWrite: boolean; sel: DraftSelection; busy: boolean; onClose: () => void }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const { ask, dialog: askDialog } = useAsk();
  const { sel, busy } = props;
  const priorOf = (key: string) => props.prior.options.find((o) => o.key === key);

  const list = (kind: "c" | "r", files: SourceFile[], removable: boolean) => (
    <ul className="flex flex-col rounded-md border border-line">
      {files.map((f) => {
        const key = `${kind}:${f.id}`;
        return (
          <li key={f.id} className="flex min-w-0 items-center gap-2 border-b border-row-line px-2.5 py-1.5 last:border-b-0">
            <input
              type="checkbox"
              aria-label={`${f.fileName} 초안에 넣기`}
              disabled={!f.attachable || !props.canWrite || busy}
              checked={f.attachable && !sel.off.has(key)}
              onChange={() => sel.toggle(key)}
              className="size-4 shrink-0 accent-navy"
            />
            {f.url ? (
              <a href={f.url} className="min-w-0 grow truncate text-ui text-link" title={f.attachable ? f.fileName : `${f.fileName} — AI가 못 읽음: ${f.parseError ?? ""}`} target="_blank" rel="noreferrer">
                {f.fileName}
              </a>
            ) : (
              <span className="min-w-0 grow truncate text-ui" title={f.attachable ? f.fileName : `${f.fileName} — AI가 못 읽음: ${f.parseError ?? ""}`}>
                {f.fileName}
              </span>
            )}
            {f.relation && (
              <span className={`shrink-0 rounded-chip px-1 text-xs ${RELATION_TAG[f.relation].cls}`} title={RELATION_TAG[f.relation].title}>
                {RELATION_TAG[f.relation].text}
              </span>
            )}
            <span className={`shrink-0 font-mono text-xs ${f.attachable ? "text-muted-2" : "text-warn"}`}>
              {f.attachable ? `${kb(f.bytes)}${f.chars !== null ? ` · ${charsLabel(f.chars)}` : ""}` : "AI가 못 읽음"}
            </span>
            {removable && (
              <button
                type="button"
                disabled={busy}
                aria-label={`${f.fileName} 지우기`}
                title="카드 전용 자료에서 지우기"
                onClick={() =>
                  ask(
                    [{ title: `「${f.fileName}」을(를) 카드 전용 자료에서 지울까요?`, body: [], confirmLabel: "지우기" }],
                    async () => {
                      setErr(null);
                      const r = await deleteCardMaterial(f.id);
                      if (r.ok) router.refresh();
                      else setErr(r.message ?? "지우지 못했습니다.");
                    },
                  )
                }
                className={`flex size-6 shrink-0 items-center justify-center rounded border border-field-line text-xs text-muted hover:border-navy ${T.off}`}
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
  // 묶음 머리(작은 제목 + 오른쪽 짧은 표시)와 한 줄 설명(넘치면 말줄임 — 전문은 title)
  const head = (title: string, aside?: ReactNode) => (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <h4 className="min-w-0 truncate text-xs font-semibold text-muted">{title}</h4>
      {aside && <span className="shrink-0 text-xs text-muted-2">{aside}</span>}
    </div>
  );
  const note = (short: string, full: string) => (
    <p className="min-w-0 truncate text-xs leading-4 text-muted-2" title={full}>
      {short}
    </p>
  );

  return (
    <section aria-label="근거 자료" className="flex min-h-0 grow flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-5">
        <h3 className="min-w-0 truncate text-sm font-bold text-navy" title="초안에 넣을 근거 — 고른 상태는 AI 초안 탭의 요청과 같음">
          근거 자료
        </h3>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted">첨부 {sel.count}건</span>
          <button type="button" onClick={props.onClose} aria-label="근거 자료 닫기" title="닫고 탭으로 (Esc)" className="flex size-7 shrink-0 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
            ✕
          </button>
        </span>
      </div>
      <div className="flex min-h-0 grow flex-col gap-5 overflow-y-auto px-5 py-4">
        {head("과제관리카드(원장)", "늘 넣음")}
        <div className="flex min-w-0 flex-col gap-1.5">
          {head("전년도 보고서 같은 과제 절(과거 실적)", `${sel.priorKeys.length}/2`)}
          {sel.priorKeys.length > 0 ? (
            <ul className="flex flex-col rounded-md border border-line">
              {sel.priorKeys.map((key) => {
                const o = priorOf(key);
                return (
                  <li key={key} className="flex min-w-0 items-center gap-2 border-b border-row-line px-2.5 py-1.5 last:border-b-0">
                    <span className="min-w-0 grow truncate text-ui" title={o?.label ?? key}>
                      {o?.label ?? key}
                    </span>
                    <span className={`shrink-0 text-xs ${o?.same ? "text-navy" : "text-warn"}`} title={`닮은 정도 ${o?.score ?? "—"}`}>
                      {o?.same ? "같은 과제" : "확인 필요"}
                    </span>
                    {props.canWrite && (
                      <button type="button" disabled={busy} aria-label={`${o?.label ?? key} 빼기`} onClick={() => sel.setPriorKeys((k) => k.filter((x) => x !== key))} className={`flex size-6 shrink-0 items-center justify-center rounded border border-field-line text-xs text-muted hover:border-navy ${T.off}`}>
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ui text-muted">{props.prior.options.length ? "넣지 않음 — 카드와 첨부 자료만으로 씁니다." : "이 주요사업의 2025 보고서 절이 공통 지식에 없습니다."}</p>
          )}
          {props.canWrite && props.prior.options.length > 0 && sel.priorKeys.length < 2 && (
            <select
              aria-label="전년도 보고서 절 더하기"
              disabled={busy}
              value=""
              onChange={(e) => e.target.value && sel.setPriorKeys((k) => [...k, e.target.value].slice(0, 2))}
              className="h-8 min-w-0 rounded-md border border-field-line bg-paper px-2 text-xs text-ink"
            >
              <option value="">절 더하기(닮은 순)…</option>
              {props.prior.options
                .filter((o) => !sel.priorKeys.includes(o.key))
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} · {o.score}
                  </option>
                ))}
            </select>
          )}
          {note("카드에 없는 과거 실적 근거 · 과거 수치는 시점을 붙여 씀", "카드에 없는 과거 실적(’25년 등)을 PDCA 흐름으로 이어 쓰는 근거 — 과거 수치는 시점을 붙여 씁니다. 처음에는 닮은 절을 자동으로 고릅니다.")}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {head("평가 기준·평가위원 관점(자동)", `${props.lens.length}건`)}
          {props.lens.length > 0 ? (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer truncate px-2.5 py-1.5 text-ui text-ink">
                {[...new Set(props.lens.map((x) => x.group))].map((g) => `${g} ${props.lens.filter((x) => x.group === g).length}`).join(" · ")}
              </summary>
              <ul className="flex flex-col border-t border-line">
                {props.lens.map((x) => (
                  <li key={`${x.group}|${x.title}`} className="flex min-w-0 items-center gap-2 border-b border-row-line px-2.5 py-1 last:border-b-0">
                    <span className="shrink-0 text-xs text-muted">{x.group}</span>
                    <span className="min-w-0 truncate text-xs" title={x.title}>
                      {x.title}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-ui text-muted">공통 지식에 평가 기준 조각이 없습니다.</p>
          )}
          {note(
            "AI가 무엇을 앞세울지 정하는 잣대 · KCA 실적으로 쓰지 않음",
            "평가위원이 점수를 주는 기준(편람 ②·평가방법·’26 대응방향·작성 착안사항)과 ’25 지적·실사 질의응답·유관기관 B+·B0 사례 — AI가 무엇을 앞세울지 정하는 잣대로 씁니다. 그 수치·다른 기관 사실은 KCA 실적으로 쓰지 않습니다.",
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {head("카드 전용 자료", `${props.cardFiles.length}건`)}
          {props.cardFiles.length > 0 ? list("c", props.cardFiles, props.canWrite) : <p className="text-ui text-muted">아직 없습니다 — 실적 결과보고·보도자료·공문 등을 올리세요.</p>}
          {props.canWrite && (
            <FileDrop
              bucket="card-materials"
              items={[]}
              list={false}
              canEdit
              compact
              hint="한글·PDF·워드·엑셀(파일당 50MB) · 이 카드에서만 씀"
              start={(name, size) => startCardMaterialUpload(props.uid, name, size)}
              finish={(path, name, mime, size) => finishCardMaterialUpload(props.uid, path, name, mime, size)}
              remove={(id) => deleteCardMaterial(id)}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {head("보고서 추가자료", props.reportFiles ? `${props.reportFiles.length}건` : undefined)}
          {props.reportFiles === null ? (
            <p className="text-ui text-muted">이 사업·부서의 보고서가 아직 준비되지 않았습니다.</p>
          ) : props.reportFiles.length > 0 ? (
            <>
              {list("r", props.reportFiles, false)}
              {props.reportFiles.some((f) => f.relation && f.relation !== "matched") && (
                <p className="text-xs leading-5 text-muted">이 과제에 연결(확정)하지 않은 자료의 수치는 초안의 숫자 근거로 인정되지 않아 「없는 숫자」 경고가 뜰 수 있습니다 — 아래 「보고서 추가자료 올리기」 화면에서 이 자료를 쓸 과제를 골라 확정해 주세요.</p>
              )}
            </>
          ) : (
            <p className="text-ui text-muted">없음</p>
          )}
          {props.reportHref && (
            <Link href={props.reportHref} className="self-start text-xs text-link">
              보고서 추가자료 올리기 →
            </Link>
          )}
        </div>
        {err && (
          <p role="alert" className="text-xs text-error">
            {err}
          </p>
        )}
      </div>
      {askDialog}
    </section>
  );
}
