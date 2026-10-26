"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CardRow } from "../../lib/cards/queries.ts";
import type { FinalInspectionView } from "../../lib/inspections/model.ts";
import { type BoardBase, type BoardView, DRAFT_FILTER_VALUES, EMPTY_VIEW, type FilterKey, type SortKey, boardHref, matchesQuery, viewParams } from "../../lib/cards/board-view.ts";
import { fixedLabelOfTrack } from "../../lib/cards/fixed.ts";
import { compareTaskNo, compareUnitId } from "../../lib/cards/view.ts";
import { withReturn } from "../../lib/nav/return-to.ts";
import { trackOfUnit } from "../../lib/tracks/index.ts";
import { PendingDot } from "../ui/pending-dot";
import { FixedLockBulk } from "./fixed-lock-bulk";

const DRAFT_CLASS: Record<string, string> = { "작성 중": "border-warn text-warn", 제출: "border-link text-link", 확정: "border-navy text-navy", 돌려받음: "border-warn bg-warn-bg text-warn" };

/**
 * 목록 열: 표는 언제나 칸 폭에 맞추고(가로 스크롤 없음) 긴 글 열은 한 줄 말줄임 + 툴팁.
 *  width: 짧은 열은 px 고정, 긴 글 열은 표 폭의 % (과제명은 나머지 전부)
 *  showFrom: 목록 칸이 이 폭(px)보다 좁으면 숨김 — 덜 중요한 열부터(숨긴 값은 과제명 툴팁·옆 창에서 보임)
 */
const COLS: Array<{ key: SortKey; label: string; width?: string; showFrom?: number }> = [
  { key: "title", label: "과제명" },
  { key: "business", label: "대상사업", width: "11%", showFrom: 1080 },
  { key: "taskNo", label: "과제번호", width: "76px" },
  { key: "department", label: "부서명", width: "9%", showFrom: 760 },
  { key: "person", label: "담당자", width: "12%", showFrom: 900 },
  { key: "kind", label: "과제구분", width: "88px", showFrom: 1100 },
  { key: "inspection", label: "AI 컨설팅", width: "136px", showFrom: 1320 },
  { key: "updated", label: "수정일자", width: "88px", showFrom: 1440 },
];
/** 열 숨김 규칙(컨테이너 쿼리) — COLS의 showFrom에서 만듦 */
const COL_CSS = COLS.filter((c) => c.showFrom)
  .map((c) => `@container board (max-width:${(c.showFrom as number) - 1}px){.board-grid [data-col="${c.key}"]{display:none}}`)
  .join("");
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "department", label: "부서명" },
  { key: "kind", label: "과제구분" },
];
/** 작성본 상태 필터 — `drafts`를 받은 화면에서만 */
const DRAFT_FILTER: { key: FilterKey; label: string } = { key: "draft", label: "작성본" };

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\s/g, "").replace(/\.$/, "");

function filterValue(r: CardRow, k: FilterKey, drafts?: Record<string, string>): string {
  if (k === "draft") return drafts?.[r.uid] ?? "시작 전";
  if (k === "department") return r.department || "—";
  return r.kind ?? "—";
}

function sortValue(r: CardRow, k: SortKey): string | number {
  switch (k) {
    case "updated":
      return r.updatedAt;
    case "inspection":
      // 최종 점검(보낸·확인한 것)의 점검월 — 초안만 있는 과제는 점검 없음과 같이
      return r.inspection && r.inspection.status !== "draft" ? r.inspection.period : "";
    case "kind":
      return r.kind ?? "";
    default:
      return String(r[k as "title" | "business" | "taskNo" | "department" | "person"] ?? "");
  }
}

/** Notion식 과제 목록 — 즉시 검색·열 정렬·필터 칩·대상사업 탭, 성과관리팀은 운영 값을 칸에서 바로 바꿈 */
export function CardBoard(props: {
  rows: CardRow[];
  staff: boolean;
  units: Array<{ id: string; label: string; name: string }>;
  selectedUid?: string;
  teamLabel: string | null;
  /** 보이는 과제가 하나도 없을 때 목록 위에 띄울 안내(내 과제: 지정된 담당 과제 없음 · 부서 미지정) */
  emptyNote?: string;
  initialView: BoardView;
  /** 목록이 놓인 화면(기본 과제 원장 /cards) */
  base?: BoardBase;
  /** 「전체」 칩의 이름(기본 「주요사업 전체」) */
  allLabel?: string;
  /** 과제별 이달 작성본 상태(내 과제 화면) */
  drafts?: Record<string, string>;
  /** 머리 아래 덧붙일 설명 */
  note?: string;
  /** 과제 원장: 제목 아래 고정 영역 일괄 확정 막대 + 목록 내려받기 */
  fixed?: { locked: number; total: number; exportHref: string; label: string };
  /** 성과관리팀: 현행화·보관함 바로가기(보관한 과제 수) */
  archived?: number;
  /** 부서 화면(/my)에서만: 과제명 옆에 경평 초안(과제별 초안)으로 바로 가는 글자 링크 */
  draftLink?: boolean;
}) {
  const [view, setView] = useState<BoardView>(props.initialView);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // 보기 설정을 주소에 반영(서버 이동 없이) — 새로고침·공유·카드 닫기 뒤에도 같은 보기
  useEffect(() => {
    const url = new URL(window.location.href);
    const next = viewParams(view);
    for (const [k, v] of Object.entries(props.base?.keep ?? {})) next.set(k, v);
    const peek = url.searchParams.get("peek");
    if (peek) next.set("peek", peek);
    const qs = next.toString();
    const target = qs ? `${url.pathname}?${qs}` : url.pathname;
    if (target !== `${url.pathname}${url.search}`) window.history.replaceState(window.history.state, "", target);
  }, [view, props.base]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = props.rows;
  const drafts = props.drafts;
  const filterDefs = useMemo(() => (drafts ? [...FILTERS, DRAFT_FILTER] : FILTERS), [drafts]);
  const unitRows = useMemo(() => (view.unit ? rows.filter((r) => r.evalUnitId === view.unit) : rows), [rows, view.unit]);
  const options = useMemo(() => {
    const o = {} as Record<FilterKey, string[]>;
    for (const f of filterDefs) o[f.key] = f.key === "draft" ? [...DRAFT_FILTER_VALUES] : [...new Set(unitRows.map((r) => filterValue(r, f.key)))].sort((a, b) => a.localeCompare(b, "ko"));
    return o;
  }, [unitRows, filterDefs]);
  const shown = useMemo(() => {
    const list = unitRows.filter((r) => filterDefs.every((f) => !view.filters[f.key].length || view.filters[f.key].includes(filterValue(r, f.key, drafts)))).filter((r) => matchesQuery(r, view.q));
    const s = view.sort;
    list.sort((a, b) => {
      if (s) {
        const va = sortValue(a, s.key);
        const vb = sortValue(b, s.key);
        const d = s.key === "taskNo" ? compareTaskNo(String(va), String(vb)) : typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "ko");
        if (d !== 0) return s.dir === "asc" ? d : -d;
      }
      return compareUnitId(a.evalUnitId, b.evalUnitId) || compareTaskNo(a.taskNo, b.taskNo);
    });
    return list;
  }, [unitRows, view, filterDefs, drafts]);

  // 경평 초안 바로가기가 돌아올 곳(이 목록 화면 주소, 보기 상태 포함)
  const returnHref = boardHref(view, undefined, props.base);
  const activeFilters = filterDefs.flatMap((f) => view.filters[f.key].map((v) => ({ key: f.key, label: f.label, value: v })));
  const setSort = (key: SortKey) =>
    setView((v) => ({ ...v, sort: v.sort?.key !== key ? { key, dir: "asc" } : v.sort.dir === "asc" ? { key, dir: "desc" } : null }));
  const toggleFilter = (key: FilterKey, value: string) =>
    setView((v) => {
      const cur = v.filters[key];
      return { ...v, filters: { ...v.filters, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] } };
    });

  const countText = shown.length !== unitRows.length ? `${shown.length} / 전체 ${unitRows.length}개` : `${shown.length}개`;
  const cell = "border-b border-row-line px-2.5 whitespace-nowrap";

  return (
    <div className="flex min-w-0 flex-col gap-4" data-keep-peek={filterOpen ? "" : undefined}>
      {props.emptyNote && props.rows.length === 0 && <p className="text-sm text-muted-2">{props.emptyNote}</p>}
      {props.fixed && <FixedLockBulk locked={props.fixed.locked} total={props.fixed.total} exportHref={props.fixed.exportHref} label={props.fixed.label} />}

      {/* 평가단위 선택 상자(왼쪽) + 도구(오른쪽) — 트랙·단위 개수와 상관없이 같은 틀(경영관리 14개 ↔ 주요사업 3개), 많은 선택지는 칩 줄로 펼치지 않음 */}
      <div className="flex min-w-0 items-center justify-between gap-x-4 border-b border-line-strong">
        <div className="flex min-w-0 items-center py-2">
          {(props.staff || props.units.length > 0) && (
            <select
              aria-label="대상사업"
              value={view.unit}
              onChange={(e) => setView((v) => ({ ...v, unit: e.target.value, filters: EMPTY_VIEW.filters }))}
              className="h-8 max-w-[320px] min-w-0 rounded-md border border-line-strong bg-field px-2.5 text-ui text-ink focus:border-navy"
            >
              {[{ id: "", label: "전체", name: props.allLabel ?? "주요사업 전체" }, ...props.units].map((u) => {
                const n = u.id ? rows.filter((r) => r.evalUnitId === u.id).length : rows.length;
                return (
                  <option key={u.id || "all"} value={u.id} title={u.name}>
                    {u.label} ({n})
                  </option>
                );
              })}
            </select>
          )}
        </div>
        <div className="relative ml-auto flex shrink-0 items-center gap-2 py-2">
          <span className="text-xs whitespace-nowrap text-muted-2" aria-live="polite">
            {props.note && <>{props.note} · </>}
            {countText}
          </span>
          <button
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-ui ${filterOpen || activeFilters.length ? "bg-paper text-navy" : "text-muted-2 hover:bg-paper"}`}
          >
            필터{activeFilters.length ? ` ${activeFilters.length}` : ""}
          </button>
          {view.sort && (
            <button type="button" onClick={() => setView((v) => ({ ...v, sort: null }))} className="flex h-8 items-center rounded-md px-2.5 text-ui text-navy hover:bg-paper" title="정렬 풀기">
              {COLS.find((c) => c.key === view.sort!.key)?.label} {view.sort.dir === "asc" ? "↑" : "↓"} ✕
            </button>
          )}
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-field px-2.5 text-muted focus-within:border-navy">
            <span className="sr-only">과제 검색</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={view.q}
              onChange={(e) => setView((v) => ({ ...v, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Escape" && setView((v) => ({ ...v, q: "" }))}
              placeholder="검색 (/)"
              aria-label="과제명·담당자·부서·과제번호 검색"
              className="w-[180px] border-0 bg-transparent text-ui text-ink outline-none"
            />
          </label>
          {filterOpen && (
            <div className="absolute top-full right-0 z-menu mt-1 w-[520px] max-w-[90vw] rounded-lg border border-line bg-paper p-4 shadow-lg" data-keep-peek>
              <div className="grid grid-cols-2 gap-4">
                {filterDefs.map((f) => (
                  <fieldset key={f.key} className="min-w-0">
                    <legend className="mb-1.5 text-xs font-semibold text-muted">{f.label}</legend>
                    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                      {options[f.key].map((v) => (
                        <label key={v} className="flex min-w-0 items-center gap-2 text-ui text-ink">
                          <input type="checkbox" checked={view.filters[f.key].includes(v)} onChange={() => toggleFilter(f.key, v)} />
                          <span className="truncate">{v}</span>
                          <span className="ml-auto font-mono text-xs text-muted">{unitRows.filter((r) => filterValue(r, f.key, drafts) === v).length}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => setView((v) => ({ ...v, filters: EMPTY_VIEW.filters }))} className="text-xs text-link underline">
                  필터 지우기
                </button>
                <button type="button" onClick={() => setFilterOpen(false)} className="h-7 rounded-md bg-navy px-3 text-xs font-semibold text-white">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map((f) => (
            <button key={`${f.key}:${f.value}`} type="button" onClick={() => toggleFilter(f.key, f.value)} className="rounded-full border border-navy bg-paper px-2.5 py-0.5 text-xs text-navy">
              {f.label}: {f.value} ✕
            </button>
          ))}
        </div>
      )}
      <section aria-label="과제 목록" className="board-grid min-w-0 overflow-hidden rounded-lg border border-line bg-paper [container:board/inline-size]">
        <style>{COL_CSS}</style>
        <div>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="h-10 bg-thead text-left text-xs font-semibold text-muted">
                {COLS.map((c, i) => {
                  const on = view.sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      data-col={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      aria-sort={on ? (view.sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`border-b border-line px-0 whitespace-nowrap ${i === 0 ? "border-r border-r-row-line" : ""}`}
                    >
                      <button type="button" onClick={() => setSort(c.key)} title={c.label} className={`flex h-10 w-full min-w-0 items-center gap-1 px-2.5 text-left hover:bg-row-hover ${i === 0 ? "pl-4" : ""} ${on ? "text-navy" : ""}`}>
                        <span className="truncate">{c.label}</span>
                        <span aria-hidden="true" className="shrink-0 text-xs">
                          {on ? (view.sort!.dir === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const selected = r.uid === props.selectedUid;
                const bg = selected ? "bg-row-hover" : "bg-paper group-hover:bg-row-hover";
                return (
                  <tr key={r.id} className={`group h-12 ${selected ? "bg-row-hover" : "hover:bg-row-hover"}`}>
                    <td data-col="title" className={`${cell} border-r border-r-row-line pl-4 ${bg}`}>
                      <div className="flex min-w-0 items-center gap-1">
                        <Link
                          href={boardHref(view, r.uid, props.base)}
                          scroll={false}
                          data-card-link
                          title={r.title}
                          aria-current={selected ? "true" : undefined}
                          className="flex min-w-0 grow items-center gap-2 text-navy no-underline"
                        >
                          {props.staff && r.fixedLocked && (
                            <span title={`고정 영역(${fixedLabelOfTrack(trackOfUnit(r.evalUnitId))}) 확정됨`} className="shrink-0 text-muted">
                              <Lock size={12} strokeWidth={2} aria-label="고정 영역 확정됨" />
                            </span>
                          )}
                          <span className={`truncate group-hover:underline ${selected ? "font-bold" : "font-semibold"}`}>{r.title}</span>
                          {props.drafts?.[r.uid] && (
                            <span className={`shrink-0 rounded-chip border px-[5px] text-xs leading-[18px] font-semibold ${DRAFT_CLASS[props.drafts[r.uid]] ?? "border-field-line text-muted-2"}`}>{props.drafts[r.uid]}</span>
                          )}
                          <PendingDot className="ml-auto" />
                          <span className="hidden shrink-0 rounded border border-field-line bg-paper px-1.5 text-xs font-semibold text-muted-2 group-hover:inline">열기</span>
                        </Link>
                        {props.draftLink && (
                          <Link
                            href={withReturn(`/reports/cards/${r.uid}${props.base?.keep ? `?${new URLSearchParams(props.base.keep)}` : ""}`, returnHref)}
                            title="경평 초안 — 과제별 초안 열기"
                            aria-label={`${r.taskNo} 경평 초안 열기`}
                            className="inline-flex min-h-6 shrink-0 items-center rounded px-1 text-xs whitespace-nowrap text-link no-underline hover:underline"
                          >
                            경평 초안
                          </Link>
                        )}
                      </div>
                    </td>
                    <td data-col="business" className={`${cell} truncate text-muted-2`} title={r.business}>
                      {r.business}
                    </td>
                    <td data-col="taskNo" className={`${cell} truncate font-mono text-ui text-navy`} title={r.taskNo}>
                      {r.taskNo}
                    </td>
                    <td data-col="department" className={`${cell} truncate text-muted-2`} title={[r.department, r.team].filter(Boolean).join(" ")}>
                      {r.department || "—"}
                    </td>
                    <td data-col="person" className={`${cell} truncate text-muted-2`} title={r.person}>
                      {r.person || "—"}
                    </td>
                    <td data-col="kind" className={`${cell} truncate`}>
                      {r.kind ? (
                        <span className={`rounded-chip border px-[5px] text-xs leading-5 ${r.kind === "신규과제" ? "border-link font-semibold text-link" : "border-field-line text-muted-2"}`}>{r.kind}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td data-col="inspection" className={`${cell} truncate text-ui text-muted-2`} title={r.inspection?.title}>
                      {r.inspection ? <InspectionCell v={r.inspection} /> : "—"}
                    </td>
                    <td data-col="updated" className={`${cell} truncate font-mono text-xs text-muted`}>
                      {fmtDate(r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-10 text-center text-sm text-muted">
                    조건에 맞는 과제가 없습니다.{" "}
                    <button type="button" onClick={() => setView((v) => ({ ...EMPTY_VIEW, unit: v.unit }))} className="text-link underline">
                      검색·필터 지우기
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {props.staff && (
        <p className="text-ui text-muted">과제명을 누르면 과제관리카드 원문이 오른쪽에 열립니다 — 바로 고칠 수 있고 자동 저장됩니다. 열 이름을 누르면 정렬, 「/」는 검색입니다.</p>
      )}
    </div>
  );
}

const VERDICT_CLASS: Record<string, string> = { 보완요청: "text-warn", 재점검필요: "text-error", 점검완료: "text-navy" };

/** AI 컨설팅 칸: 최종 점검(점검월 · 판정 · 보냄/확인) — 초안만 있으면 흐리게, 최종보다 늦은 초안이 있으면 점(성과관리팀만) */
function InspectionCell({ v }: { v: FinalInspectionView }) {
  if (v.status === "draft") return <span className="text-muted">{v.text}</span>;
  const month = `${Number(v.period.slice(5))}월${v.pre ? " 사전" : ""}`;
  return (
    <>
      {month}
      {v.verdict && <span className={`ml-1 font-semibold ${VERDICT_CLASS[v.verdict] ?? ""}`}>{v.verdict}</span>}
      <span className="text-muted"> · {v.status === "acknowledged" ? "확인" : "보냄"}</span>
      {v.draftPeriod && <span aria-label="새 초안 있음" className="ml-1 inline-block size-1.5 rounded-full bg-link align-middle" />}
    </>
  );
}
