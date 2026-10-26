"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveReportBlocks } from "../../app/(app)/reports/actions";
import { T } from "../ui/kit";
import { type ReportBlock, parseTableText } from "../../lib/reports/model.ts";

type Draft = ReportBlock & { tableText?: string };

const toDraft = (b: ReportBlock): Draft => (b.type === "table" ? { ...b, tableText: (b.rows ?? []).map((r) => r.join("\t")).join("\n") } : b);
const fromDraft = (b: Draft): ReportBlock => (b.type === "table" ? { id: b.id, type: "table", rows: parseTableText(b.tableText ?? "") } : { id: b.id, type: b.type, level: b.level, text: b.text ?? "" });
let seq = 0;
const tempId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * 보고서 원고 직접 쓰기: 제목·문단·표 블록을 넣고 순서를 바꿔 저장합니다(과제별 AI 초안은 「경평 초안 › 과제별 초안」에서 카드마다).
 * 표는 엑셀·한글에서 복사해 붙여 넣으면 탭으로 나뉜 행이 그대로 표가 됩니다.
 */
export function BlockEditor({ reportId, initial, doneHref }: { reportId: number; initial: ReportBlock[]; doneHref: string }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Draft[]>(initial.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const edit = (i: number, patch: Partial<Draft>) => {
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const add = (type: ReportBlock["type"]) => {
    setBlocks((bs) => [...bs, type === "table" ? { id: tempId(), type, tableText: "구분\t추진노력\t추진결과\n" } : { id: tempId(), type, level: type === "heading" ? 1 : undefined, text: "" }]);
    setDirty(true);
  };
  const save = () =>
    start(async () => {
      const res = await saveReportBlocks(reportId, blocks.map(fromDraft));
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "저장했습니다." : "저장하지 못했습니다.") });
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  const field = "w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-sm leading-6 text-ink";

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-sticky flex flex-wrap items-center gap-2 rounded-md border border-line bg-thead px-3 py-2">
        <span className="text-xs font-semibold text-muted">블록 추가</span>
        {(
          [
            ["heading", "제목"],
            ["paragraph", "문단"],
            ["table", "표"],
          ] as const
        ).map(([t, l]) => (
          <button key={t} type="button" onClick={() => add(t)} className="h-7 rounded-md border border-field-line bg-paper px-2.5 text-xs font-semibold text-ink hover:border-navy">
            + {l}
          </button>
        ))}
        {msg && (
          <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-muted-2" : "text-error"}`}>
            {msg.text}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">{dirty ? "저장 안 한 변경 있음" : `블록 ${blocks.length}개`}</span>
          <button type="button" onClick={() => router.push(doneHref, { scroll: false })} disabled={dirty && pending} className="h-8 rounded-md border border-field-line bg-paper px-3 text-xs font-semibold text-ink hover:border-navy">
            {dirty ? "저장하지 않고 닫기" : "보기로"}
          </button>
          <button type="button" disabled={pending || !dirty} onClick={save} className={T.btnPrimary}>
            {pending ? "저장 중…" : "저장"}
          </button>
        </span>
      </div>
      {blocks.length === 0 && <p className="rounded-md border border-dashed border-field-line px-4 py-6 text-center text-ui text-muted">위에서 제목·문단·표를 넣어 쓰기 시작하세요.</p>}
      <ol className="flex flex-col gap-2">
        {blocks.map((b, i) => (
          <li key={b.id} className="flex min-w-0 gap-2 rounded-md border border-line bg-paper p-2.5">
            <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
              <span className="font-mono text-xs text-muted">{i + 1}</span>
              <button type="button" aria-label={`${i + 1}번 블록 위로`} onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-navy disabled:cursor-not-allowed disabled:text-line">
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`${i + 1}번 블록 아래로`} onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="text-muted hover:text-navy disabled:cursor-not-allowed disabled:text-line">
                <ArrowDown size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="flex min-w-0 grow flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <select
                  value={b.type === "heading" ? `heading${b.level ?? 1}` : b.type}
                  aria-label={`${i + 1}번 블록 종류`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("heading")) edit(i, { type: "heading", level: v === "heading2" ? 2 : 1, text: b.type === "table" ? "" : b.text });
                    else if (v === "paragraph") edit(i, { type: "paragraph", level: undefined, text: b.type === "table" ? "" : b.text });
                    else edit(i, { type: "table", tableText: b.type === "table" ? b.tableText : "" });
                  }}
                  className="h-7 rounded-md border border-field-line bg-paper px-1.5 text-xs"
                >
                  <option value="heading1">제목(큰)</option>
                  <option value="heading2">제목(작은)</option>
                  <option value="paragraph">문단</option>
                  <option value="table">표</option>
                </select>
                <span className="font-mono text-xs text-muted">{b.id}</span>
                <button
                  type="button"
                  aria-label={`${i + 1}번 블록 삭제`}
                  onClick={() => {
                    setBlocks((bs) => bs.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  className="ml-auto text-muted hover:text-warn"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              {b.type === "table" ? (
                <textarea value={b.tableText ?? ""} onChange={(e) => edit(i, { tableText: e.target.value })} rows={4} placeholder="엑셀·한글 표를 복사해 붙여 넣기(탭 또는 | 로 칸 구분, 줄마다 행)" aria-label={`${i + 1}번 표`} className={`${field} font-mono text-ui`} />
              ) : (
                <textarea
                  value={b.text ?? ""}
                  onChange={(e) => edit(i, { text: e.target.value })}
                  rows={b.type === "heading" ? 1 : 3}
                  placeholder={b.type === "heading" ? "제목" : "개조식 문단(두괄식, 쉬운 말)"}
                  aria-label={`${i + 1}번 ${b.type === "heading" ? "제목" : "문단"}`}
                  className={`${field} ${b.type === "heading" ? "font-serif font-bold text-navy" : ""}`}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
