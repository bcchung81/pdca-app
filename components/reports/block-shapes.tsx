"use client";

import { RefreshCw, X } from "lucide-react";
import { T } from "../ui/kit";
import { useEffect, useId, useRef, useState } from "react";
import { type BlockShapeOption, type BlockShapesResult, type DraftBlockResult, applyBlockShape, previewBlockShapes } from "../../app/(app)/reports/cards/edit-actions";
import { getReportSelectPreview } from "../../app/(app)/reports/cards/actions";
import { blockShapesProgress, rangeText } from "../../lib/ai/progress.ts";
import type { ShapeMenuItem } from "../../lib/reports/block-shape.ts";
import { AiProgress } from "../workspace/ai-progress";

// 경평 초안 과제별 초안 「다른 모양으로」(2026-10-12 사용자 요구 「개별 수정안이 요청에 따라 다양한 프레임워크로」):
// 끌어 고르기 도구줄의 「다른 모양」 → 오른쪽 자리(수정 이력·근거 자료처럼 탭 대신 잠시 열고 ✕·Esc로 돌아감)에서
// 원하는 모양(선택)·덧붙일 요청(선택) → AI 한 번(previewBlockShapes — 저장 안 함)이 같은 내용을 다른 모양 2~3안으로 →
// 안마다 본문과 같은 렌더러로 그린 미리보기·판면(분량) 차이·새로 생기는 근거 없는 숫자 → 「이 모양으로 바꾸기」(applyBlockShape — 그때 저장, 되돌리기 가능).

/** 견본 종이 폭(본문 170mm — 종이 여백·그림자는 아래 CSS로 걷음) CSS px */
const BLOCK_PX = (170 * 96) / 25.4;
/** 미리보기 상자 안 견본: 종이 여백·그림자 없이(본문 글자색 그대로 — 구성안 견본처럼 흐리게 하지 않음) */
const PREVIEW_CSS = ".bs-prev .kca-dg-doc .k-paper{box-shadow:none;margin:0;padding:0;min-height:0}";

const GROUPS: Array<{ key: ShapeMenuItem["group"]; label: string }> = [
  { key: "base", label: "기본 도식" },
  { key: "own", label: "이 과제만의 요소(근거가 있어야 씀)" },
  { key: "text", label: "글·띠" },
];

/** 상자 폭에 맞춘 배율(견본 170mm를 줄여 넣음 — 1배 넘게 키우지 않음) */
function useFitZoomOf(ref: React.RefObject<HTMLDivElement | null>): number {
  const [zoom, setZoom] = useState(0.6);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, Math.max(0.3, (el.clientWidth - 2) / BLOCK_PX))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return zoom;
}

/** 견본 그림 한 장(서버가 section-html.ts로 그린 그 블록 — 사용자 입력이 아니라 서버 렌더러 출력) */
function Preview({ html, label }: { html: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const zoom = useFitZoomOf(box);
  return (
    <div ref={box} role="img" aria-label={label} className="bs-prev pointer-events-none min-w-0 overflow-hidden rounded-md border border-line bg-white p-1 select-none">
      <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const heightText = (h: BlockShapeOption["height"], mg: boolean) => `${mg ? "분량" : "판면"} ${h.delta > 0 ? "+" : ""}${h.delta}mm`;
const heightTitle = (h: BlockShapeOption["height"], mg: boolean) => `${mg ? "초안 높이 어림" : "판면 어림"} ${h.before} → ${h.after}mm${h.budget ? ` / ${mg ? "배정" : "예산"} ${h.budget}mm` : ""}`;

/** 오른쪽 자리의 「다른 모양으로」 패널 — 블록이 바뀌면 부르는 쪽이 key로 새로 그림 */
export function BlockShapes(props: {
  uid: string;
  blockIndex: number;
  /** 고른 글(머리 안내만) */
  quote: string;
  version: string | null;
  /** 지금 이 블록의 모양 코드(목록에서 뺌) */
  currentCode: string;
  menu: ShapeMenuItem[];
  mg: boolean;
  onClose: () => void;
  onApplied: (r: Extract<DraftBlockResult, { ok: true; kind: "edit" }>, request: string) => void;
  onRefresh: () => void;
}) {
  const [want, setWant] = useState("");
  const [request, setRequest] = useState("");
  const [run, setRun] = useState<{ at: number; want: string | null } | null>(null);
  const [result, setResult] = useState<Extract<BlockShapesResult, { ok: true }> | null>(null);
  const [error, setError] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const alive = useRef(true);
  const id = useId();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 진행 줄의 「공통 지식」: 이 카드에 선별 방식이 적용되면 고른 원문 수(서버 getReportSelectPreview, null이면 통째로 넣기)
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    void getReportSelectPreview(props.uid).then((n) => {
      if (alive.current) setSelected(n);
    });
  }, [props.uid]);

  const choices = props.menu.filter((m) => m.code !== props.currentCode);
  const current = props.menu.find((m) => m.code === props.currentCode);
  const wantName = choices.find((m) => m.code === want)?.name ?? null;

  const make = async () => {
    if (!props.version || run) return;
    setRun({ at: Date.now(), want: wantName });
    setError(null);
    try {
      const r = await previewBlockShapes(props.uid, { blockIndex: props.blockIndex, request, want: want || null, version: props.version });
      if (!alive.current) return;
      if (r.ok) setResult(r);
      else setError({ message: r.message, conflict: r.conflict });
    } catch {
      if (alive.current) setError({ message: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      if (alive.current) setRun(null);
    }
  };

  const apply = async (o: BlockShapeOption) => {
    if (!result || applying) return;
    setApplying(o.code);
    setError(null);
    try {
      const r = await applyBlockShape(props.uid, { blockIndex: result.blockIndex, out: o.out, why: o.why, request, model: result.model, version: result.version });
      if (!alive.current) return;
      if (r.ok && r.kind === "edit") props.onApplied(r, `모양 바꾸기 — 「${result.current.name}」 → 「${o.name}」${request.trim() ? ` · ${request.trim()}` : ""}`);
      else if (!r.ok) setError({ message: r.message, conflict: r.conflict });
    } catch {
      if (alive.current) setError({ message: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      if (alive.current) setApplying(null);
    }
  };

  return (
    <section aria-label="다른 모양으로" className="flex min-h-0 grow flex-col">
      <style>{PREVIEW_CSS}</style>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-5">
        <h3 className="min-w-0 truncate text-sm font-bold text-navy" title={`${props.blockIndex + 1}번 블록의 같은 내용을 다른 모양으로 — 미리 보고 고른 안만 저장합니다`}>
          {props.blockIndex + 1}번 블록 · 다른 모양으로
        </h3>
        <button type="button" onClick={props.onClose} aria-label="다른 모양으로 닫기" title="닫고 탭으로 (Esc)" className="flex size-7 shrink-0 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-5 py-4">
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-2">
          <span className="shrink-0">지금 모양</span>
          <span className="min-w-0 truncate rounded-md bg-target-bg px-1.5 leading-[1.6] font-semibold text-navy" title={current?.use}>
            {current?.name ?? props.currentCode}
          </span>
        </p>
        {props.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs break-keep text-quote-ink">{props.quote}</p>}

        {!run && (
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={`${id}-want`} className="text-xs font-semibold text-ink">
              원하는 모양
            </label>
            <select id={`${id}-want`} value={want} onChange={(e) => setWant(e.target.value)} className="h-9 w-full min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui text-ink">
              <option value="">AI가 내용에 맞게 2~3안</option>
              {GROUPS.map((g) => {
                const xs = choices.filter((m) => m.group === g.key);
                return xs.length ? (
                  <optgroup key={g.key} label={g.label}>
                    {xs.map((m) => (
                      <option key={m.code} value={m.code} disabled={m.ok === false} title={m.ok === false ? m.why : m.use}>
                        {m.name}
                        {m.ok === false ? " — 근거 없음" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            {want && <p className="text-xs leading-[1.5] break-keep text-muted-2">{choices.find((m) => m.code === want)?.use} — 첫 안을 이 모양으로, 나머지는 다른 모양(있으면)</p>}
            <label htmlFor={`${id}-req`} className="text-xs font-semibold text-ink">
              덧붙일 요청 <span className="font-normal text-muted">(선택)</span>
            </label>
            <textarea
              id={`${id}-req`}
              value={request}
              maxLength={2000}
              rows={2}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="예: 단계가 드러나게 · 추진실적을 오른쪽에"
              className="w-full resize-none rounded-[10px] bg-field px-3 py-2 text-ui leading-[1.55] text-ink outline-none focus:shadow-focus"
            />
            <div className="flex items-center gap-2">
              <span className="min-w-0 text-xs leading-4 break-keep text-muted">미리보기만 — 고른 안만 저장</span>
              <button type="button" onClick={() => void make()} disabled={!props.version || Boolean(applying)} className={`ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-navy bg-navy px-3 text-xs font-bold whitespace-nowrap text-white ${T.off}`}>
                {result ? "다시 만들기" : "안 만들기"} · {rangeText(blockShapesProgress({ blockNo: props.blockIndex + 1, want: wantName }).expect)}
              </button>
            </div>
          </div>
        )}
        {run && <AiProgress spec={blockShapesProgress({ blockNo: props.blockIndex + 1, want: run.want, selected: selected ?? undefined })} startedAt={run.at} />}

        {error && (
          <div role="alert" className="flex min-w-0 flex-col gap-1.5 rounded-md bg-warn-bg px-3 py-2 text-xs break-keep text-warn">
            <p>{error.message}</p>
            {error.conflict && (
              <button type="button" onClick={props.onRefresh} className="flex items-center gap-1 self-end text-xs font-semibold text-link hover:underline">
                <RefreshCw size={11} aria-hidden="true" />
                새로 고침
              </button>
            )}
          </div>
        )}

        {result && !run && (
          <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-3">
            {result.reply && (
              <p className="rounded-md bg-thead px-2.5 py-1.5 text-xs leading-[1.55] break-keep whitespace-pre-wrap text-ink">
                <b className="mr-1 text-navy">AI</b>
                {result.reply}
              </p>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted">지금 · {result.current.name}</p>
              <Preview html={result.current.html} label={`지금 모양 ${result.current.name} 미리보기`} />
            </div>
            {result.options.length === 0 && <p className="rounded-md bg-thead px-3 py-2 text-xs break-keep text-muted-2">쓸 수 있는 안이 없습니다 — 아래 까닭을 보고 원하는 모양·요청을 바꿔 다시 만들어 주세요.</p>}
            {result.options.map((o, i) => (
              <article key={o.code} aria-label={`${i + 1}안 ${o.name}`} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted">{i + 1}안</span>
                  <h4 className="min-w-0 truncate text-ui font-bold text-navy" title={o.name}>
                    {o.name}
                  </h4>
                  <span title={heightTitle(o.height, result.mg)} className={`ml-auto shrink-0 rounded-md px-1.5 text-xs font-semibold ${!result.mg && o.height.budget && o.height.after > o.height.budget * 1.04 ? "bg-warn-bg text-warn" : "bg-thead text-muted-2"}`}>
                    {heightText(o.height, result.mg)}
                  </span>
                </div>
                {o.why && <p className="text-xs leading-[1.55] break-keep text-ink">{o.why}</p>}
                <Preview html={o.html} label={`${i + 1}안 ${o.name} 미리보기`} />
                {o.unknown.length > 0 && <p className="text-xs break-keep text-warn">근거에 없는 숫자 {o.unknown.length}개: {o.unknown.slice(0, 6).join(" · ")}</p>}
                {o.dropped.map((x) => (
                  <p key={x} className="text-xs break-keep text-muted-2">
                    {x}
                  </p>
                ))}
                <button
                  type="button"
                  onClick={() => void apply(o)}
                  disabled={Boolean(applying)}
                  className={`flex h-8 items-center justify-center self-end rounded-[10px] border border-navy px-3 text-xs font-bold whitespace-nowrap text-navy hover:bg-navy hover:text-white ${T.off}`}
                >
                  {applying === o.code ? "바꾸는 중…" : "이 모양으로 바꾸기"}
                </button>
              </article>
            ))}
            {result.dropped.length > 0 && (
              <details className="min-w-0 text-xs">
                <summary className="cursor-pointer font-semibold text-muted">뺀 안 {result.dropped.length}</summary>
                <ul className="mt-1 flex flex-col gap-0.5 break-keep text-muted-2">
                  {result.dropped.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
