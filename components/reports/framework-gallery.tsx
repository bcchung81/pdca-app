"use client";

import { X } from "lucide-react";
import { T } from "../ui/kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { listOutlineExamples } from "../../app/(app)/reports/cards/outline-actions";
import { ALT_LIMITS, type ExampleItem, FRAME_REQUEST_MAX, type FrameChoice, altCostText, frameKey, frameLabel, isEmptyFrame } from "../../lib/reports/framework-pick.ts";
import { PaneTabs } from "../workspace/pane-tabs";
import { type LoadedCatalog, loadOutlineCatalog } from "./outline-catalog";
import { SampleHtml } from "./outline-sample";

/** 이 과제만의 요소 종류 이름(lib/reports/frameworks.ts SHAPES와 같은 글 — 값은 가져오지 않고 그대로 적음, own에 나올 수 있는 종류만) */
const KIND_NAME: Record<string, string> = { quotes: "인용 상자", voices: "현장 목소리", define: "용어 정의", case: "우수사례", hub: "협업 구조", chart: "막대" };

type Tab = "story" | "pattern" | "example";
const TABS: Array<{ key: Tab; label: string; title: string }> = [
  { key: "story", label: "이야기 틀", title: "무엇을 앞세울지 — 2025 최종본·프레임워크에서 뽑은 틀" },
  { key: "pattern", label: "구성 패턴", title: "몇 단·어떤 블록 순서·배치로 놓을지 — 도식 Pool 정의서·표준보고서 전개양식" },
  { key: "example", label: "2025 예시 절", title: "2025 경영실적보고서의 실제 절을 골라 「이 절처럼」 — 짜임만 본뜨고 사실·숫자는 이 과제 근거만" },
];

/** 고른 짜임 칩 줄(여러 안 후보·한 안 고른 것) */
function Chip({ text, onRemove, disabled }: { text: string; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className="flex h-6 max-w-[320px] min-w-0 items-center gap-1 rounded-md border border-navy/40 bg-paper pr-1 pl-2 text-xs text-ink" title={text}>
      <span className="min-w-0 truncate">{text}</span>
      {onRemove && (
        <button type="button" disabled={disabled} onClick={onRemove} aria-label={`${text} 빼기`} className={`flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink ${T.off}`}>
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * 짜임 고르기 대화 창(2026-10-12 — 예전 「이야기 틀 고르기」를 넓힘): 이야기 틀(무엇을 앞세울지)·구성 패턴(몇 단·블록 순서·배치)·2025 예시 절(「이 절처럼」) 세 갈래를 탭으로 보이고,
 * 갈래마다 하나씩 함께 고를 수 있습니다(예: 이야기 틀 + 구성 패턴). 요청 글(선택 — 짜임·강조에 대한 지시일 뿐 근거 아님)을 함께 보내고,
 * 「여러 안 비교」를 켜면 서로 다른 짜임 2~3개(또는 「AI가 다르게」)를 후보로 담아 한꺼번에 만들어 견줍니다(구성안 N번 비용 — 저장하지 않고 고른 안만 저장).
 * 이야기 틀 카드는 avail이 있으면 「이 과제만의 요소」가 지금 근거로 얼마나 준비됐는지 점으로 보여 줍니다.
 */
export function FrameworkGallery(props: {
  open: boolean;
  uid: string;
  /** 경영관리 카드(경영관리 이야기 틀 12종 · 경영관리 2025 절) */
  mg?: boolean;
  /** 머리 아래 한 줄(경영관리 절 이름 등) */
  context?: string;
  current?: string | null;
  aiStory?: string | null;
  alternative?: string | null;
  avail?: Record<string, { ok: boolean; why: string }> | null;
  busy?: boolean;
  confirmLabel: string;
  /** 열 때 고른 상태(요청 칸 위에서 이미 고른 짜임) */
  initial?: FrameChoice | null;
  /** 요청 글 칸을 보임(구성안 패널·절 다시 짜기 — 요청 칸이 따로 있는 곳에서는 없음) */
  request?: { initial: string } | null;
  /** 여러 안 비교를 켤 수 있음 */
  alts?: boolean;
  onPick: (frame: FrameChoice, request: string) => void;
  onAlts?: (alts: FrameChoice[], request: string) => void;
  onClose: () => void;
}) {
  const { open, current, aiStory, alternative, avail, busy, confirmLabel, onPick, onClose } = props;
  const mg = Boolean(props.mg);
  const ref = useRef<HTMLDialogElement>(null);
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [pick, setPick] = useState<FrameChoice>({});
  const [multi, setMulti] = useState(false);
  const [cands, setCands] = useState<FrameChoice[]>([]);
  const [req, setReq] = useState("");
  const [examples, setExamples] = useState<{ items: ExampleItem[] } | { error: string } | null>(null);
  const [query, setQuery] = useState("");
  // 열 때마다 처음 상태로(렌더 중에 정리 — 효과 안에서 바로 setState하지 않음)
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setPick(props.initial ?? {});
      setMulti(false);
      setCands([]);
      setReq(props.request?.initial ?? "");
      setTab(props.initial?.pattern ? "pattern" : props.initial?.example ? "example" : "story");
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadOutlineCatalog(mg).then((c) => {
      if (live) setCatalog(c);
    });
    return () => {
      live = false;
    };
  }, [open, mg]);

  // 2025 예시 절 목록은 그 탭을 처음 열 때 한 번
  useEffect(() => {
    if (!open || tab !== "example" || examples) return;
    let live = true;
    listOutlineExamples(props.uid)
      .then((r) => {
        if (live) setExamples(r.ok ? { items: r.items } : { error: r.message });
      })
      .catch(() => {
        if (live) setExamples({ error: "목록을 불러오지 못했습니다." });
      });
    return () => {
      live = false;
    };
  }, [open, tab, examples, props.uid]);

  const shown = useMemo(() => {
    if (!examples || !("items" in examples)) return [];
    const q = query.replace(/\s+/g, "").toLowerCase();
    return q ? examples.items.filter((x) => x.title.replace(/\s+/g, "").toLowerCase().includes(q)) : examples.items;
  }, [examples, query]);

  /** 갈래 하나 고르기(한 안: 그 갈래만 바꿈·같은 것을 다시 누르면 뺌 / 여러 안: 그 짜임을 후보에 넣거나 뺌) */
  const choose = (one: FrameChoice) => {
    if (multi) {
      const k = frameKey(one);
      setCands((xs) => (xs.some((x) => frameKey(x) === k) ? xs.filter((x) => frameKey(x) !== k) : xs.length >= ALT_LIMITS.max ? xs : [...xs, one]));
      return;
    }
    setPick((p) => {
      const n = { ...p };
      if (one.story !== undefined) n.story = p.story === one.story ? undefined : one.story;
      if (one.pattern !== undefined) n.pattern = p.pattern === one.pattern ? undefined : one.pattern;
      if (one.example !== undefined) n.example = p.example?.key === one.example.key ? undefined : one.example;
      return Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)) as FrameChoice;
    });
  };
  const isOn = (one: FrameChoice) => (multi ? cands.some((x) => frameKey(x) === frameKey(one)) : one.story ? pick.story === one.story : one.pattern ? pick.pattern === one.pattern : one.example ? pick.example?.key === one.example.key : false);

  /** 탭마다 고른 수(탭 이름 옆) */
  const picked = (t: Tab) => (multi ? cands : [pick]).filter((c) => (t === "story" ? c.story : t === "pattern" ? c.pattern : c.example)).length;
  const n = cands.length;
  const canConfirm = multi ? n >= ALT_LIMITS.min : !isEmptyFrame(pick) || Boolean(props.request && req.trim());
  const card = (on: boolean) => `flex flex-col gap-1.5 rounded-lg border p-2.5 text-left ${on ? "border-2 border-navy" : "border-field-line"} bg-paper hover:border-navy`;

  return (
    <dialog
      ref={ref}
      aria-label="짜임 고르기"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="fixed top-1/2 left-1/2 h-[min(800px,90vh)] w-[min(1080px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30"
    >
      {/* 견본 그림 CSS는 창에 한 번만 · 스크롤은 목록 한 곳만(창은 고정 높이·overflow hidden) */}
      {catalog && <style>{catalog.css}</style>}
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-col gap-1 border-b border-line px-5 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate font-serif text-base font-bold text-navy">짜임 고르기{props.context ? ` — ${props.context}` : ""}</h3>
            <button type="button" onClick={() => ref.current?.close()} aria-label="닫기" className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-muted hover:text-navy">
              ×
            </button>
          </div>
          <p className="truncate text-xs text-muted-2" title="고른 짜임은 뼈대일 뿐입니다 — 사실·숫자는 이 과제의 근거에 있는 것만 쓰고, 근거가 없는 칸은 만들지 않습니다.">
            갈래마다 하나씩 함께 고를 수 있습니다(예: 이야기 틀 + 구성 패턴). 짜임은 뼈대일 뿐 — 사실·숫자는 이 과제 근거에 있는 것만 씁니다.
          </p>
          <div className="mt-1 flex h-10 items-stretch">
            <PaneTabs ariaLabel="짜임 갈래" tabs={TABS.map((t) => ({ key: t.key, label: `${t.label}${picked(t.key) ? ` · ${picked(t.key)}` : ""}`, title: t.title }))} active={tab} onChange={setTab} />
          </div>
        </div>

        <div className="min-h-0 grow overflow-y-auto px-5 py-4">
          {!catalog && <p className="text-sm text-muted-2">불러오는 중…</p>}
          {catalog && tab === "story" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
              {/* 경영관리는 섞음 없음(2026-10-12 C5 — 주 틀 + 보조 틀, 옛 구성안의 섞음만 읽음) */}
              {catalog.frameworks.filter((f) => !(mg && f.story === "섞음")).map((f) => {
                const isMix = !f.html;
                const own = f.own;
                const readyN = own.filter((k) => avail?.[k]?.ok).length;
                const missing = own.filter((k) => !avail?.[k]?.ok).map((k) => KIND_NAME[k] ?? k);
                return (
                  <button key={f.story} type="button" onClick={() => choose({ story: f.story })} aria-pressed={isOn({ story: f.story })} className={card(isOn({ story: f.story }))}>
                    <div className="relative flex h-[140px] w-full items-start justify-center overflow-hidden rounded-md bg-thead">
                      {isMix ? <p className="flex h-full items-center px-3 text-center text-xs text-muted-2">AI가 재료를 보고 정함</p> : <SampleHtml html={f.html} zoom={0.3} />}
                      <div className="absolute top-1 right-1 flex gap-1">
                        {current === f.story && <span className="rounded-chip border border-navy bg-paper px-1 text-xs text-navy">지금 틀</span>}
                        {aiStory === f.story && current !== f.story && <span className="rounded-chip border border-link bg-paper px-1 text-xs text-link">AI 추천</span>}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-ui font-semibold text-ink" title={`${f.no} ${f.story}`}>
                        {f.no} {f.story}
                      </p>
                      <p className="line-clamp-2 text-xs leading-4 text-muted" title={f.fit}>
                        {f.fit}
                      </p>
                    </div>
                    {f.steps.length > 0 && (
                      <p className="line-clamp-2 text-xs leading-4 text-muted-2" title={f.steps.join(" → ")}>
                        {f.steps.join(" → ")}
                      </p>
                    )}
                    {f.example && (
                      <p className="truncate text-xs text-muted" title={f.example}>
                        {f.example}
                      </p>
                    )}
                    {avail && own.length > 0 && (
                      <p className="truncate text-xs text-muted-2" title={missing.length ? `모자란 근거: ${missing.join("·")}` : undefined}>
                        {"●".repeat(readyN)}
                        {"○".repeat(own.length - readyN)} 근거 있음 {readyN}/{own.length}
                      </p>
                    )}
                    {/* 근거가 없는 핵심 도식 — 이 틀을 골라도 구성안에서 빠질 수 있음(2026-09-28 1-나 현장 목소리형) */}
                    {avail && missing.length > 0 && <p className="line-clamp-2 text-xs leading-4 break-keep text-warn">근거 부족 — {missing.join("·")}는 빠질 수 있음(원문 자료를 첨부하면 들어감)</p>}
                  </button>
                );
              })}
            </div>
          )}
          {catalog && tab === "pattern" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
              {catalog.patterns.map((pt) => (
                <button key={pt.id} type="button" onClick={() => choose({ pattern: pt.id })} aria-pressed={isOn({ pattern: pt.id })} className={card(isOn({ pattern: pt.id }))}>
                  <div className="relative flex h-[140px] w-full items-start justify-center overflow-hidden rounded-md bg-thead">
                    <SampleHtml html={pt.html} zoom={0.3} />
                    <div className="absolute top-1 right-1 flex gap-1">
                      {pt.pages && <span className="rounded-chip border border-field-line bg-paper px-1 text-xs text-muted">{pt.pages}쪽</span>}
                      <span className="rounded-chip border border-field-line bg-paper px-1 text-xs text-muted" title={pt.ref}>
                        {pt.source}
                      </span>
                    </div>
                  </div>
                  <p className="truncate text-ui font-semibold text-ink" title={pt.name}>
                    {pt.name}
                  </p>
                  <p className="line-clamp-2 text-xs leading-4 break-keep text-muted" title={pt.when}>
                    {pt.when}
                  </p>
                  <p className="line-clamp-2 text-xs leading-4 break-keep text-muted-2" title={`단 구성: ${pt.stages}\n${pt.steps.join("\n")}`}>
                    {pt.stages}
                  </p>
                  {pt.avoid && <p className="text-xs leading-4 break-keep text-warn">정의서 「가급적 지양」 — 도입 재료가 정말 없을 때만</p>}
                </button>
              ))}
            </div>
          )}
          {tab === "example" && (
            <div className="flex min-w-0 flex-col gap-2">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="절 제목으로 찾기" aria-label="2025 예시 절 찾기" className="h-8 w-full max-w-[420px] min-w-0 rounded-md border border-field-line bg-paper px-2.5 text-ui text-ink" />
              <p className="text-xs leading-5 break-keep text-muted-2">2025 경영실적보고서의 실제 절입니다. 고르면 그 절의 단 구성·라벨 순서·도식 모양·배치를 본뜹니다 — 그 절의 사실·숫자는 근거가 아니어서 쓰지 않습니다.</p>
              {!examples && <p className="text-sm text-muted-2">불러오는 중…</p>}
              {examples && "error" in examples && <p role="alert" className="text-sm text-error">{examples.error}</p>}
              {examples && "items" in examples && (
                <ul className="flex min-w-0 flex-col gap-1">
                  {shown.map((x, i) => {
                    const head = i === 0 || shown[i - 1].same !== x.same;
                    const one: FrameChoice = { example: { key: x.key, title: x.title } };
                    const on = isOn(one);
                    return (
                      <li key={x.key} className="min-w-0">
                        {head && <p className="mt-1 mb-0.5 text-xs font-semibold text-muted-2">{x.same ? (mg ? "같은 지표" : "같은 주요사업") : mg ? "다른 지표" : "다른 주요사업"}</p>}
                        <button type="button" onClick={() => choose(one)} aria-pressed={on} title={x.title} className={`flex h-8 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 text-left text-ui ${on ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}>
                          <span className="min-w-0 grow truncate">{x.title.replace(/^2025 보고서\s*/, "")}</span>
                          {x.page && <span className={`shrink-0 font-mono text-xs ${on ? "text-white/80" : "text-muted-2"}`}>p.{x.page}</span>}
                        </button>
                      </li>
                    );
                  })}
                  {!shown.length && <li className="text-xs text-muted-2">맞는 절이 없습니다.</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        {alternative && tab === "story" && (
          <p className="shrink-0 truncate border-t border-line px-5 py-2 text-xs text-muted-2" title={alternative}>
            차선: {alternative}
          </p>
        )}
        <div className="flex shrink-0 flex-col gap-2 border-t border-line px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="shrink-0 text-muted-2">{multi ? `비교할 안 ${n}/${ALT_LIMITS.max} —` : "고른 짜임 —"}</span>
            {multi ? (
              cands.length ? (
                cands.map((c, i) => <Chip key={`${frameKey(c)}-${i}`} text={`${i + 1}안 ${frameLabel(c)}`} disabled={busy} onRemove={() => setCands((xs) => xs.filter((_, j) => j !== i))} />)
              ) : (
                <span className="text-muted-2">갈래 탭에서 2~3개를 고르세요</span>
              )
            ) : isEmptyFrame(pick) ? (
              <span className="text-muted-2">{props.request ? "없음 — 요청 글만으로 다시 짤 수도 있습니다" : "없음"}</span>
            ) : (
              <Chip text={frameLabel(pick)} disabled={busy} onRemove={() => setPick({})} />
            )}
            {multi && n < ALT_LIMITS.max && (
              <button type="button" disabled={busy} onClick={() => setCands((xs) => [...xs, { auto: true }])} className={`h-6 shrink-0 rounded-md border border-dashed border-field-line px-2 text-xs text-link hover:border-navy ${T.off}`} title="AI가 다른 안과 겹치지 않는 주 틀·골격을 고름">
                + AI가 다르게
              </button>
            )}
          </div>
          {props.request && (
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              요청 글(선택 — 짜임·강조에 대한 지시일 뿐 근거가 아님)
              <textarea value={req} maxLength={FRAME_REQUEST_MAX} onChange={(e) => setReq(e.target.value)} disabled={busy} rows={2} className="min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui text-ink" placeholder="예: 지적 해소를 앞에, 추진내용은 단계 흐름으로" />
            </label>
          )}
          <div className="flex min-w-0 items-center gap-3">
            {props.alts && props.onAlts && (
              <label className="flex min-w-0 items-center gap-1.5 text-xs text-ink" title="서로 다른 짜임 2~3개로 구성안을 동시에 만들어 견준 뒤 하나만 저장합니다(진행 중인 AI 작업이 없을 때만)">
                <input
                  type="checkbox"
                  checked={multi}
                  disabled={busy}
                  onChange={(e) => {
                    setMulti(e.target.checked);
                    setCands(e.target.checked && !isEmptyFrame(pick) ? [pick] : []);
                  }}
                />
                <span className="truncate">여러 안 비교{multi ? ` · ${altCostText(Math.max(n, ALT_LIMITS.min), catalog?.altCost ?? null)}` : ""}</span>
              </label>
            )}
            <div className="ml-auto flex shrink-0 gap-2">
              <button type="button" onClick={() => ref.current?.close()} className="flex h-8 shrink-0 items-center rounded-md border border-field-line bg-paper px-3 text-xs font-semibold text-ink hover:border-navy">
                닫기
              </button>
              <button
                type="button"
                disabled={!canConfirm || busy}
                onClick={() => (multi ? props.onAlts?.(cands, req.trim()) : onPick(pick, req.trim()))}
                className={T.btnPrimary}
              >
                {busy ? "만드는 중…" : multi ? `${n}안 만들어 비교` : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
