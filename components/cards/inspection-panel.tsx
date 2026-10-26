"use client";

import { type ReactNode, useEffect, useState } from "react";
import { type CardInspection, getCardInspections } from "../../app/(app)/cards/actions";
import { acknowledgeInspection } from "../../app/(app)/my/actions";
import { currentPeriod } from "../../lib/cards/view.ts";
import { fmtDate, monthLabel } from "../../lib/format.ts";
import { finalInspection, isPreMonth } from "../../lib/inspections/model.ts";
import { InspectionSheet, TallyLine } from "../inspections/inspection-sheet";

const STATUS: Record<CardInspection["status"], string> = { draft: "초안(부서에 안 보임)", sent: "확인 필요", acknowledged: "확인함" };

/** 카드 옆 창 「점검 결과」 탭: 받은 월간 점검을 「AI 컨설팅 결과」 양식(지침 14 <출력구조>) 그대로 보면서 카드를 보완 */
export function InspectionPanel({ uid, canAck, tabs }: { uid: string; canAck: boolean; /** 머리의 제목 자리에 둘 탭(「AI 작성지원 | 점검 결과」) */ tabs?: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; items: CardInspection[]; error: string | null }>({ loading: true, items: [], error: null });
  const [pickId, setPickId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [ackMsg, setAckMsg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getCardInspections(uid).then((r) => alive && setState({ loading: false, items: r.items, error: r.ok ? null : (r.message ?? "점검을 읽지 못했습니다.") }));
    return () => {
      alive = false;
    };
  }, [uid, tick]);
  // 처음 보이는 것은 최종 점검(부서에 보낸·확인한 것 중 점검월이 가장 늦은 1건). 초안은 월 칩에 「초안」으로만(성과관리팀만 보임)
  const final = finalInspection(state.items).final;
  const cur = state.items.find((it) => it.id === pickId) ?? final ?? state.items[0];
  const now = currentPeriod();
  const chip = (it: CardInspection) => `${monthLabel(it.period)}${isPreMonth(it.period, now) ? " 사전" : ""}${it.status === "draft" ? " · 초안" : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-stretch border-b border-line px-5">{tabs ?? <h3 className="flex items-center text-sm font-bold text-navy">월간 점검</h3>}</div>
      {state.items.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-4 py-2">
          {state.items.map((it) => (
            <button key={it.id} type="button" aria-pressed={it.id === cur?.id} onClick={() => setPickId(it.id)} className={`rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${it.id === cur?.id ? "bg-navy text-white" : it.status === "draft" ? "text-muted hover:bg-row-hover" : "text-muted-2 hover:bg-row-hover"}`}>
              {chip(it)}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 grow overflow-y-auto px-4 py-4">
        {state.loading && <p className="py-6 text-center text-ui text-muted">불러오는 중…</p>}
        {state.error && (
          <p role="alert" className="py-6 text-center text-ui text-error">
            {state.error}
          </p>
        )}
        {!state.loading && !state.error && !cur && <p className="py-8 text-center text-ui leading-6 text-muted">받은 월간 점검이 없습니다.</p>}
        {cur && (
          <div className="flex flex-col gap-4 text-ui">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-navy">
                {monthLabel(cur.period)} {isPreMonth(cur.period, now) ? "사전점검" : "점검"}
              </span>
              {cur.id === final?.id && <span className="rounded-chip border border-navy px-[5px] leading-5 text-navy">최종</span>}
              <span className={cur.status === "sent" ? "text-warn" : "text-muted-2"}>{STATUS[cur.status]}</span>
              <span className="ml-auto font-mono text-muted">{fmtDate(cur.updatedAt)}</span>
            </div>
            <TallyLine result={cur.result} />
            <InspectionSheet result={cur.result} idPrefix={`panel-${cur.id}`} date={cur.updatedAt} />
            {canAck && cur.status === "sent" && (
              <div className="flex items-center gap-2">
                {ackMsg && <span role="alert" className="text-xs text-error">{ackMsg}</span>}
                <button
                  type="button"
                  onClick={async () => {
                    const r = await acknowledgeInspection(cur.id);
                    if (r.ok) setTick((n) => n + 1);
                    else setAckMsg(r.message ?? "확인하지 못했습니다.");
                  }}
                  className="ml-auto h-8 rounded-md bg-navy px-3 text-xs font-semibold text-white"
                >
                  확인했습니다
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
