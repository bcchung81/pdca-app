"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { type DraftVersionList, listDraftVersions, restoreDraftVersion } from "../../app/(app)/reports/cards/version-actions";
import { fmtDateTime } from "../../lib/format.ts";
import type { DraftVersionItem } from "../../lib/reports/draft-versions.ts";
import { useAsk } from "../ui/confirm-dialog";
import { T } from "../ui/kit";

// 경평 초안 「판 기록」(2026-11-18): 저장할 때마다 남긴 직전 판(초안 + 구성안) 목록과 「이 판으로 되돌리기」(확인 창 → 서버 restoreDraftVersion).
// 「수정 이력」 패널(draft-review.tsx DraftHistory)의 탭으로 열림. 목록 글(요약·바뀐 것)은 서버가 만들어 넘김 — 이 부품은 판 spec 검사 모듈을 읽지 않음.
// 잠긴 보고서(제출·승인)·읽기 전용 보기(?team=)·권한 없음이면 되돌리기 단추 대신 까닭 한 줄(서버가 정함 — 서버도 같은 판정으로 거절).

/** 덮은 저장의 종류 표지(직접 고침·되돌리기 — 그 밖은 바뀐 것만) */
const KIND_TAG = { text: "직접 고침", restore: "되돌리기" } as const;

export function DraftVersions(props: { uid: string; version: string | null }) {
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ loading: boolean; data: DraftVersionList | null }>({ loading: true, data: null });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const { ask, dialog } = useAsk();
  useEffect(() => {
    let alive = true;
    listDraftVersions(props.uid)
      .then((data) => alive && setState({ loading: false, data }))
      .catch(() => alive && setState({ loading: false, data: { ok: false, message: "판 기록을 읽지 못했습니다." } }));
    return () => {
      alive = false;
    };
  }, [props.uid, props.version, reload]);

  const data = state.data;
  const restore = (v: DraftVersionItem) => {
    if (!data?.ok) return;
    ask(
      [
        {
          title: "이 판으로 되돌릴까요?",
          body: [
            `${fmtDateTime(v.stateAt)}에 저장된 판(${v.summary})으로 초안과 구성안을 함께 되돌립니다.`,
            "지금 초안은 판 기록에 남아, 마음이 바뀌면 다시 되돌릴 수 있습니다.",
          ],
          confirmLabel: "되돌리기",
        },
      ],
      () =>
        start(async () => {
          const r = await restoreDraftVersion(props.uid, data.year, v.id, props.version ?? data.version ?? "").catch(() => ({ ok: false as const, message: "되돌리지 못했습니다(연결을 확인해 주세요)." }));
          setNote({ ok: r.ok, text: r.message });
          if (r.ok) router.refresh();
          setReload((n) => n + 1);
        }),
    );
  };

  if (state.loading) return <p className="py-6 text-center text-ui text-muted">불러오는 중…</p>;
  if (!data?.ok)
    return (
      <p role="alert" className="py-6 text-center text-ui text-error">
        {data?.message ?? "판 기록을 읽지 못했습니다."}
      </p>
    );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs leading-5 break-keep text-muted" title={`저장할 때마다 저장 직전 판을 남깁니다(과제마다 최근 ${data.keep}판). 직접 고침은 같은 사람이 10분 안에 이어 고친 것을 한 판으로 묶습니다.`}>
        저장 직전 판을 최근 {data.keep}개까지 남깁니다(초안 + 구성안).
      </p>
      {data.blocked && <p className="rounded-md bg-thead px-2.5 py-1.5 text-xs leading-5 break-keep text-muted-2">{data.blocked}</p>}
      {note && (
        <p role="status" className={`text-xs break-keep ${note.ok ? "text-ink" : "text-warn"}`}>
          {note.text}
        </p>
      )}
      {data.items.length === 0 ? (
        <p className="py-6 text-center text-ui text-muted" title="초안·구성안을 저장하면 저장 직전 판이 여기 남습니다.">
          아직 없습니다
        </p>
      ) : (
        <ol className="flex min-w-0 flex-col gap-3">
          {data.items.map((v) => (
            <li key={v.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5 text-ui leading-6">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{fmtDateTime(v.stateAt)} 판</span>
                <span className="rounded-md bg-revise-bg px-1.5 text-xs font-bold text-link">{v.changedLabel}</span>
                {v.saveKind && <span className="rounded-md bg-thead px-1.5 text-xs font-bold text-muted-2">{KIND_TAG[v.saveKind]}</span>}
              </div>
              <p className="min-w-0 text-xs break-keep text-muted">{v.summary}</p>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-muted" title={`${v.who}이(가) ${fmtDateTime(v.replacedAt)}에 ${v.changedLabel}을 바꿔 덮음`}>
                  {v.who} · {fmtDateTime(v.replacedAt)}에 덮음
                </span>
                {!data.blocked && (
                  <button type="button" disabled={pending} onClick={() => restore(v)} className={T.btnSm}>
                    이 판으로 되돌리기
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {dialog}
    </div>
  );
}
