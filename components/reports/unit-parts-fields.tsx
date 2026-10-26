"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { withReturn } from "../../lib/nav/return-to.ts";
import { T } from "../ui/kit";
import { type EditMap, linesToText, textToLines, valueAt } from "../../lib/reports/unit-parts-form.ts";
import type { ContactRow, CoverPart, FindingsPart, OutcomePart, PriorPart, UnitPart } from "../../lib/reports/unit-parts-mg.ts";

/**
 * 경영관리 지표 단위 부분(/reports/business/<지표>/parts) 오른쪽 탭의 입력 칸들(경평 초안 R5b 화면).
 * 코드 칸(재료에서 채우는 값 — 지적 글·숫자·실적·평가내용 제목)은 회색 글로 읽기만, ai·human 칸은 입력(여러 줄 = 불릿 하나씩).
 * 값은 부르는 쪽(unit-parts-workspace)이 든 「고친 칸」 표(EditMap)에 쌓이고, 경로는 lib/reports/unit-parts-edit.ts 허용 경로와 같음.
 */

export interface FormCtx {
  spec: UnitPart;
  edits: EditMap;
  /** 입력 칸을 둘지(아니면 읽기 전용 글) */
  editable: boolean;
  /** 저장·채우기 중(입력 잠금) */
  busy: boolean;
  set: (path: string, value: unknown) => void;
  /** 카드 id → uid(과제별 초안으로 가는 링크) */
  uids: Record<string, string>;
  /** 이 화면 주소(과제별 초안에서 돌아올 곳) */
  from: string;
  /** 계량 행 id → 두 방향 달성률 글(서버가 kpiRate로 셈 — 클라이언트에 셈 코드를 안 들임) */
  rates: Record<string, { up: string; down: string }>;
}

const field = "w-full min-w-0 rounded-md border border-field-line bg-paper px-2 py-1.5 text-ui leading-[1.55] text-ink break-keep [overflow-wrap:anywhere] disabled:bg-field disabled:text-muted";
const label = "text-xs font-semibold text-muted";
const rowBox = "flex min-w-0 flex-col gap-2 rounded-md border border-line px-3 py-2.5";

const str = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** 코드 칸: 재료에서 채워지는 값(읽기만 — 「재료로 다시 채우기」가 바꿈) */
function Code({ name, lines, empty = "—" }: { name: string; lines: string[]; empty?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={label}>
        {name} <span className="font-normal text-muted-2">· 재료에서 채움</span>
      </span>
      {lines.length ? (
        <ul className="flex min-w-0 flex-col gap-0.5 rounded-md bg-thead px-2.5 py-1.5 text-ui leading-5 text-muted-2">
          {lines.map((l, i) => (
            <li key={i} className="min-w-0 break-keep [overflow-wrap:anywhere]">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-thead px-2.5 py-1.5 text-ui text-muted-2">{empty}</p>
      )}
    </div>
  );
}

/** 글 목록 칸(한 줄 = 불릿 하나): 입력 칸 또는 읽기 전용 목록 */
function Lines({ ctx, path, name, hint }: { ctx: FormCtx; path: string; name: string; hint?: string }) {
  const value = valueAt(ctx.edits, ctx.spec, path);
  const text = linesToText(value);
  const dirty = path in ctx.edits;
  const Wrap = ctx.editable ? "label" : "div";
  return (
    <Wrap className="flex min-w-0 flex-col gap-0.5">
      <span className={label}>
        {name}
        {dirty && <span className="ml-1 font-normal text-warn">· 고침</span>}
      </span>
      {ctx.editable ? (
        <textarea
          value={text}
          disabled={ctx.busy}
          rows={Math.min(8, Math.max(2, text.split("\n").length + 1))}
          onChange={(e) => ctx.set(path, textToLines(e.target.value))}
          placeholder={hint ?? "한 줄이 불릿 하나입니다. 「- 」로 시작하면 하위 줄입니다."}
          aria-label={name}
          className={`${field} resize-y ${dirty ? "border-warn" : ""}`}
        />
      ) : (
        <ul className="flex min-w-0 flex-col gap-0.5 text-ui leading-5 text-ink">
          {str(value).length ? (
            str(value).map((l, i) => (
              <li key={i} className="min-w-0 break-keep [overflow-wrap:anywhere]">
                {l}
              </li>
            ))
          ) : (
            <li className="text-muted-2">비어 있음</li>
          )}
        </ul>
      )}
    </Wrap>
  );
}

/** 짧은 글 칸 */
function Text({ ctx, path, name }: { ctx: FormCtx; path: string; name: string }) {
  const value = String(valueAt(ctx.edits, ctx.spec, path) ?? "");
  const dirty = path in ctx.edits;
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className={label}>
        {name}
        {dirty && <span className="ml-1 font-normal text-warn">· 고침</span>}
      </span>
      {ctx.editable ? (
        <input value={value} disabled={ctx.busy} onChange={(e) => ctx.set(path, e.target.value)} aria-label={name} className={`h-8 ${field} ${dirty ? "border-warn" : ""}`} />
      ) : (
        <span className="text-ui text-ink">{value || "—"}</span>
      )}
    </label>
  );
}

/** 과제 번호 칩(그 카드의 과제별 초안으로) */
function CardChip({ ctx, id, taskNo }: { ctx: FormCtx; id: string; taskNo: string }) {
  const uid = ctx.uids[id];
  const cls = "inline-flex h-5 shrink-0 items-center rounded-chip border border-field-line px-[5px] font-mono text-xs leading-5 whitespace-nowrap";
  return uid ? (
    <Link href={withReturn(`/reports/cards/${uid}`, ctx.from)} title={`${taskNo} 과제별 초안`} className={`${cls} text-link no-underline hover:border-navy`}>
      {taskNo}
    </Link>
  ) : (
    <span className={`${cls} text-muted-2`}>{taskNo}</span>
  );
}

const WARN_TAG = "inline-flex h-5 shrink-0 items-center rounded-chip border border-warn px-[5px] text-xs leading-5 whitespace-nowrap text-warn";

// ---------------------------------------------------------------------------
// 부분별 입력

function CoverForm({ ctx, part }: { ctx: FormCtx; part: CoverPart }) {
  const contacts = (valueAt(ctx.edits, ctx.spec, "human.contacts") as ContactRow[] | undefined) ?? [];
  const COLS: Array<[keyof ContactRow, string]> = [
    ["role", "직위"],
    ["name", "성명"],
    ["phone", "연락처"],
    ["email", "E-mail"],
  ];
  const setRow = (i: number, key: keyof ContactRow, v: string) => ctx.set("human.contacts", contacts.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {part.code.components.map((c) => (
        <div key={c.chunkKey} className={rowBox}>
          <p className="flex min-w-0 items-baseline gap-2 text-ui font-semibold text-ink">
            <span className="min-w-0 truncate" title={`${part.code.indicator} · ${c.label}`}>
              {c.label || part.code.indicator}
            </span>
            <span className="shrink-0 text-xs font-normal text-muted-2">
              {c.kind} · {c.method} · {c.weight !== null ? `${c.weight}점` : "가중치 【확인】"}
            </span>
          </p>
          <Code name="지표정의" lines={c.definition ? [c.definition] : []} />
          <Code name="세부평가내용" lines={c.criteria.map((x, i) => `${String(i + 1).padStart(2, "0")} ${x}`)} />
          {c.note && <p className="text-xs text-warn">{c.note}</p>}
        </div>
      ))}
      <div className={rowBox}>
        <p className={label}>
          담당자 표 <span className="font-normal text-muted-2">· 개인정보라 사람이 씁니다</span>
          {"human.contacts" in ctx.edits && <span className="ml-1 font-normal text-warn">· 고침</span>}
        </p>
        {contacts.length === 0 && !ctx.editable && <p className="text-ui text-muted-2">비어 있음</p>}
        <ul className="flex min-w-0 flex-col gap-2">
          {contacts.map((r, i) => (
            <li key={i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
              {COLS.map(([key, name]) => (
                <input key={key} value={r[key]} disabled={!ctx.editable || ctx.busy} onChange={(e) => setRow(i, key, e.target.value)} placeholder={name} aria-label={`담당자 ${i + 1} ${name}`} className={`h-8 ${field}`} />
              ))}
              {ctx.editable && (
                <button type="button" disabled={ctx.busy} onClick={() => ctx.set("human.contacts", contacts.filter((_, j) => j !== i))} aria-label={`담당자 ${i + 1} 행 지우기`} title="이 행 지우기" className="col-span-2 flex h-6 w-fit items-center gap-1 text-xs text-muted hover:text-warn">
                  <X size={12} aria-hidden /> 행 지우기
                </button>
              )}
            </li>
          ))}
        </ul>
        {ctx.editable && contacts.length < 10 && (
          <button type="button" disabled={ctx.busy} onClick={() => ctx.set("human.contacts", [...contacts, { role: "", name: "", phone: "", email: "" }])} className={`${T.btn} w-fit`}>
            <Plus size={13} aria-hidden /> 행 더하기
          </button>
        )}
      </div>
    </div>
  );
}

function FindingsForm({ ctx, part }: { ctx: FormCtx; part: FindingsPart }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {part.code.unmatched.length > 0 && (
        <details className="min-w-0 rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-xs text-ink">
          <summary className="cursor-pointer font-semibold text-warn">미반영 지적 {part.code.unmatched.length}건 — 어느 카드 지적 행과도 짝지어지지 않은 ’25 평가위원 지적</summary>
          <ul className="mt-1.5 flex min-w-0 flex-col gap-1.5">
            {part.code.unmatched.map((o) => (
              <li key={o.chunkKey + o.no} className="min-w-0 break-keep [overflow-wrap:anywhere]">
                <b className="mr-1 font-mono">#{o.no}</b>
                {o.label && <span className="mr-1 text-muted-2">[{o.label}]</span>}
                {o.text}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-2">행은 사람이 더합니다(카드 「지적 및 개선방안」에 행이 생기면 다시 채우기로 들어옵니다).</p>
        </details>
      )}
      {part.rows.length === 0 && <p className="rounded-md border border-line px-3 py-2 text-ui text-muted-2">이 지표 카드에 「지적 및 개선방안」 행이 없습니다.</p>}
      {part.rows.map((r, i) => (
        <div key={r.id} className={rowBox}>
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui font-semibold text-ink">
            <CardChip ctx={ctx} id={r.code.cardId} taskNo={r.code.taskNo} />
            <span>지적 {r.code.rowIndex + 1}행</span>
            {r.code.differs && (
              <span className={WARN_TAG} title="카드 지적 행 글이 ’25 평가위원 지적 원문과 많이 다름 — 원문과 대조">
                원문 다름
              </span>
            )}
          </p>
          <Code name="지적/권고 사항" lines={r.code.finding} />
          {r.code.source && (
            <details className="min-w-0 text-xs text-muted-2">
              <summary className="cursor-pointer">
                짝 원문 #{r.code.source.no} · 겹침 {Math.round(r.code.source.score * 100)}%
              </summary>
              <p className="mt-1 break-keep [overflow-wrap:anywhere]">{r.code.source.text}</p>
            </details>
          )}
          {r.code.plan.length > 0 && (
            <details className="min-w-0 text-xs text-muted-2">
              <summary className="cursor-pointer">카드 개선방안 {r.code.plan.length}줄 (조치 및 개선실적의 재료)</summary>
              <ul className="mt-1 flex min-w-0 flex-col gap-0.5">
                {r.code.plan.map((l, j) => (
                  <li key={j} className="break-keep [overflow-wrap:anywhere]">
                    {l}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Lines ctx={ctx} path={`rows.${i}.ai.actions`} name="조치 및 개선실적" />
        </div>
      ))}
    </div>
  );
}

function PriorForm({ ctx, part }: { ctx: FormCtx; part: PriorPart }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {part.rows.map((r, i) => (
        <div key={r.id} className={rowBox}>
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui font-semibold text-ink">
            <span className="shrink-0 font-mono text-xs text-navy">평가내용{r.code.evalNo}</span>
            <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{r.code.title}</span>
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-2">
            대응 카드
            {r.code.cards.length ? r.code.cards.map((c) => <CardChip key={c.id} ctx={ctx} id={c.id} taskNo={c.taskNo} />) : <span className={WARN_TAG}>없음</span>}
          </p>
          <Lines ctx={ctx} path={`rows.${i}.human.upTo`} name="’25까지의 주요실적 (출발값: 2025 보고서 같은 표)" />
          <Lines ctx={ctx} path={`rows.${i}.ai.now`} name="’26 주요실적" />
          <Lines ctx={ctx} path={`rows.${i}.ai.effect`} name="개선효과" />
        </div>
      ))}
    </div>
  );
}

function OutcomeForm({ ctx, part }: { ctx: FormCtx; part: OutcomePart }) {
  const sub = "text-ui font-bold text-navy";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className={sub}>
        가. 계량 성과지표 <span className="text-xs font-normal text-muted-2">· 표에 넣을 행 {part.kpi.filter((_, i) => Boolean(valueAt(ctx.edits, ctx.spec, `kpi.${i}.human.checked`))).length}/{part.kpi.length}</span>
      </h3>
      {part.kpi.length === 0 && <p className="rounded-md border border-line px-3 py-2 text-ui text-muted-2">이 지표 카드에 계량 성과지표 행이 없습니다.</p>}
      {part.kpi.map((k, i) => {
        const on = Boolean(valueAt(ctx.edits, ctx.spec, `kpi.${i}.human.checked`));
        const polarity = valueAt(ctx.edits, ctx.spec, `kpi.${i}.human.polarity`) === "down" ? "down" : "up";
        const actual = k.code.actual.trim();
        const rate = actual ? (ctx.rates[k.id]?.[polarity] ?? "") : "";
        return (
          <div key={k.id} className={`${rowBox} ${on ? "" : "bg-thead"}`}>
            <div className="flex min-w-0 items-start gap-2">
              <input
                type="checkbox"
                checked={on}
                disabled={!ctx.editable || ctx.busy}
                onChange={(e) => ctx.set(`kpi.${i}.human.checked`, e.target.checked)}
                aria-label={`${k.code.taskNo} ${k.code.name} 표에 넣기`}
                title="계량 성과지표 표에 넣을지"
                className="mt-1 size-4 shrink-0"
              />
              <div className="flex min-w-0 grow flex-col gap-1">
                <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui font-semibold text-ink">
                  <CardChip ctx={ctx} id={k.code.cardId} taskNo={k.code.taskNo} />
                  <span className="min-w-0 break-keep [overflow-wrap:anywhere]">
                    {k.code.name}
                    {k.code.unit && <span className="font-normal text-muted-2">({k.code.unit})</span>}
                  </span>
                  {k.code.match2025 && (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-chip border border-field-line px-[5px] text-xs font-normal text-muted-2" title={`2025 표의 「${k.code.match2025}」 행과 이름이 같음`}>
                      ’25 표와 같은 이름
                    </span>
                  )}
                </p>
                <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-2">
                  <span>’25 실적 {k.code.prev || "—"}</span>
                  <span>’26 목표 {k.code.target || "—"}</span>
                  <span className={actual ? "" : "text-warn"}>실적 {actual || "미입력"}</span>
                  {on && rate && <span className={rate.startsWith("【") ? "text-warn" : "font-semibold text-ink"}>달성률 {rate}</span>}
                </p>
              </div>
            </div>
            {on && (
              <>
                <label className="flex min-w-0 items-center gap-2">
                  <span className={label}>극성</span>
                  <select
                    value={polarity}
                    disabled={!ctx.editable || ctx.busy}
                    onChange={(e) => ctx.set(`kpi.${i}.human.polarity`, e.target.value)}
                    aria-label={`${k.code.taskNo} ${k.code.name} 극성`}
                    className="h-7 min-w-0 rounded-md border border-field-line bg-paper px-1.5 text-xs text-ink disabled:bg-field"
                  >
                    <option value="up">높을수록 좋음 (실적 ÷ 목표)</option>
                    <option value="down">낮을수록 좋음 (목표 ÷ 실적)</option>
                  </select>
                  {`kpi.${i}.human.polarity` in ctx.edits && <span className="text-xs text-warn">· 고침</span>}
                </label>
                <Lines ctx={ctx} path={`kpi.${i}.ai.analysis`} name="성과 분석" />
              </>
            )}
          </div>
        );
      })}

      <h3 className={`${sub} mt-1`}>나. 비계량 성과지표</h3>
      {part.qual.map((r, i) => (
        <div key={r.id} className={rowBox}>
          <p className="min-w-0 text-xs text-muted-2 break-keep [overflow-wrap:anywhere]">
            <span className="mr-1 font-mono text-navy">평가내용{r.code.evalNo}</span>
            {r.code.title}
          </p>
          <Text ctx={ctx} path={`qual.${i}.human.label`} name="구분" />
          <Lines ctx={ctx} path={`qual.${i}.ai.result`} name="실적" />
          <Lines ctx={ctx} path={`qual.${i}.ai.analysis`} name="성과 분석" />
        </div>
      ))}

      <h3 className={`${sub} mt-1`}>향후 개선계획</h3>
      {part.plan.map((r, i) => (
        <div key={r.id} className={rowBox}>
          <p className="min-w-0 text-xs text-muted-2 break-keep [overflow-wrap:anywhere]">
            <span className="mr-1 font-mono text-navy">평가내용{r.code.evalNo}</span>
            {r.code.title}
          </p>
          <Text ctx={ctx} path={`plan.${i}.human.label`} name="구분" />
          <Lines ctx={ctx} path={`plan.${i}.ai.self`} name="자체평가" />
          <Lines ctx={ctx} path={`plan.${i}.ai.plan`} name="개선방안" />
        </div>
      ))}
    </div>
  );
}

/** 부분 하나의 입력 칸들 */
export function PartForm({ ctx }: { ctx: FormCtx }) {
  const p = ctx.spec;
  if (p.part === "cover") return <CoverForm ctx={ctx} part={p} />;
  if (p.part === "findings") return <FindingsForm ctx={ctx} part={p} />;
  if (p.part === "prior") return <PriorForm ctx={ctx} part={p} />;
  return <OutcomeForm ctx={ctx} part={p} />;
}
