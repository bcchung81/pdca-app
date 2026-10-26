"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type jspreadsheet from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jsuites/dist/jsuites.css";
import "./paste-grid.css";
import { T, Tag, type Tone as TagTone } from "../../../../components/ui/kit";
import type { AppRole } from "../../../../lib/auth/access.ts";
import { COL, ROLE_LABEL, ROLE_VALUE, type GridRowOut, type Tone, analyzeGrid, emailsOf, gridRowIn } from "../../../../lib/users/grid.ts";
import { parsePasteTable } from "../../../../lib/users/paste.ts";
import type { ApplyRowResult, ApplyStatus, ExistingSnapshot, TeamOption } from "../../../../lib/users/types.ts";
import { applyUserPaste, lookupExistingUsers } from "../actions";

type Sheet = jspreadsheet.WorksheetInstance;
type JSS = jspreadsheet.JSpreadsheet;

const RESULT: Record<ApplyStatus, { label: string; tone: TagTone }> = {
  created: { label: "만듦", tone: "solid" },
  updated: { label: "반영", tone: "link" },
  unchanged: { label: "변경 없음", tone: "muted" },
  skipped: { label: "건너뜀", tone: "muted" },
  error: { label: "실패", tone: "warnSolid" },
};

const SHEET_ROWS = 100; // 엑셀처럼 빈 줄이 계속 이어짐(보이는 줄 수는 창 높이가 정함)
const emptyRow = (): (string | boolean)[] => ["", "", "", "", "", "", "", false, ""];
const emptyRows = (n = SHEET_ROWS) => Array.from({ length: n }, emptyRow);

/** 우클릭 메뉴 한글 문구(Jspreadsheet 기본은 영어) */
const DICTIONARY: Record<string, string> = {
  "Insert a new row before": "위에 줄 끼우기",
  "Insert a new row after": "아래에 줄 끼우기",
  "Delete selected rows": "선택한 줄 지우기",
  "Are you sure to delete the selected rows?": "선택한 줄을 지울까요?",
  "No records found": "찾은 줄이 없습니다",
  "Copy...": "복사",
  "Paste...": "붙여넣기",
};

/**
 * 엑셀 붙여넣기 등록 — 엑셀처럼 생긴 격자(Jspreadsheet CE, MIT)에 이름·이메일·팀명 영역을 붙여넣으면
 * 옆 열(D~G)에 추천 팀·후보·상태·반영 체크가 채워지고, 확인이 어려운 줄은 팀 칸 드롭다운에서 골라 확정합니다.
 * 줄 분석은 순수 함수(`lib/users/grid.ts`)이고, 이미 있는 계정 여부만 서버에 묻습니다. 반영할 때 서버가 모두 다시 판정합니다.
 */
export function PasteImport({ teams, actorRole, allowedDomains }: { teams: TeamOption[]; actorRole: AppRole; allowedDomains: string[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Sheet | null>(null);
  const existingRef = useRef(new Map<string, ExistingSnapshot | null>());
  const toneRef = useRef<Array<{ team: Tone; status: Tone; role: Tone; message: string; blank: boolean }>>([]);
  const defaultRoleRef = useRef<string>(ROLE_VALUE.dept);
  const pasteRef = useRef<{ y0: number; n: number } | null>(null); // 방금 붙여넣은 줄(라이브러리가 붙여넣기 뒤 이벤트에 주는 줄 번호가 문자열 이어붙이기로 깨져 있어 직접 기억)
  const busyRef = useRef(false); // 프로그램이 칸을 쓰는 중(사용자 변경으로 오해하지 않게)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);
  const propsRef = useRef({ teams, actorRole, allowedDomains });
  const recomputeRef = useRef<() => void>(() => {});
  useEffect(() => {
    propsRef.current = { teams, actorRole, allowedDomains };
  }, [teams, actorRole, allowedDomains]);

  const [ready, setReady] = useState(false);
  const [outs, setOuts] = useState<GridRowOut[]>([]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [defaultRole, setDefaultRole] = useState<string>(ROLE_VALUE.dept);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyRowResult[] | null>(null);
  const [applying, startApply] = useTransition();

  const teamName = useMemo(() => new Map(teams.map((t) => [String(t.id), t])), [teams]);

  /** 붙여넣기 한 번에 칸마다 change 이벤트가 쏟아지므로 모아서 한 번만 분석 */
  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => recomputeRef.current(), 40);
  }, []);

  /** 격자 전체 줄을 다시 분석해 계산 열을 써넣고 색을 칠함 */
  const recompute = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const data = ws.getData() as unknown[][];
    const rows = data.map(gridRowIn);
    const p = propsRef.current;
    const out = analyzeGrid(rows, { teams: p.teams, existing: existingRef.current, actorRole: p.actorRole, allowedDomains: p.allowedDomains });

    busyRef.current = true;
    ws.ignoreHistory = true; // 계산 열 써넣기는 되돌리기 기록에 남기지 않음
    try {
      out.forEach((o, y) => {
        const put = (x: number, v: string | boolean) => {
          if (String(data[y]?.[x] ?? (typeof v === "boolean" ? false : "")) !== String(v)) ws.setValueFromCoords(x, y, v, true);
        };
        put(COL.role, o.role);
        put(COL.team, o.team);
        put(COL.auto, o.auto);
        put(COL.pick, o.pick);
        put(COL.hint, o.hint);
        put(COL.status, o.status);
      });
    } finally {
      ws.ignoreHistory = false;
      busyRef.current = false;
    }
    toneRef.current = out.map((o) => ({ team: o.teamTone, status: o.statusTone, role: o.roleTone, message: o.message, blank: o.blank }));
    out.forEach((o, y) => {
      for (const [x, tone] of [[COL.role, o.roleTone], [COL.team, o.teamTone], [COL.status, o.statusTone]] as const) {
        const cell = ws.getCell(x, y);
        if (cell) cell.dataset.tone = tone;
      }
      for (const x of [COL.team, COL.pick]) {
        const cell = ws.getCell(x, y);
        if (cell) cell.dataset.blank = o.blank ? "1" : "";
      }
      const status = ws.getCell(COL.status, y);
      if (status) status.title = o.message;
    });
    setOuts(out);

    // 아직 묻지 않은 이메일은 잠시 뒤 한꺼번에 서버에 물어 「이미 있는 계정」 판정을 채움
    const missing = emailsOf(rows).filter((e) => !existingRef.current.has(e));
    if (lookupRef.current) clearTimeout(lookupRef.current);
    if (missing.length) {
      lookupRef.current = setTimeout(async () => {
        const res = await lookupExistingUsers(missing.slice(0, 300));
        if (res.ok) {
          for (const e of missing) existingRef.current.set(e, res.existing[e] ?? null);
        } else {
          setNotice(`기존 계정 여부를 확인하지 못했습니다(${res.message}). 반영할 때 서버가 다시 확인합니다.`);
          for (const e of missing) existingRef.current.set(e, null);
        }
        schedule();
      }, 400);
    }
  }, [schedule]);

  useEffect(() => {
    recomputeRef.current = recompute;
  }, [recompute]);

  useEffect(() => {
    let cancelled = false;
    let js: JSS | null = null;
    const host = hostRef.current;
    (async () => {
      // 라이브러리는 브라우저 전용(document를 씀)이라 화면이 뜬 뒤에 불러옴
      const mod = await import("jspreadsheet-ce");
      if (cancelled || !host) return;
      js = ((mod as unknown as { default?: JSS }).default ?? (mod as unknown as JSS)) as JSS;
      js.setDictionary(DICTIONARY);
      host.innerHTML = "";
      const source = propsRef.current.teams.map((t) => ({ id: String(t.id), name: `${t.name} · ${t.cards}장`, group: t.hq ?? "본부 없음" }));
      const tone = (key: "team" | "status" | "role") => (cell: HTMLTableCellElement, _v: unknown, _x: number, y: number) => {
        cell.dataset.tone = toneRef.current[y]?.[key] ?? "";
        if (key === "team" || key === "role") cell.dataset.blank = toneRef.current[y]?.blank === false ? "" : "1";
      };
      const pickRender = (cell: HTMLTableCellElement, _v: unknown, _x: number, y: number) => {
        cell.dataset.blank = toneRef.current[y]?.blank === false ? "" : "1";
      };
      const sheets = js(host as HTMLDivElement, {
        about: false,
        // 붙여넣은 영역을 이름·이메일·팀명 세 열로 정리: 머리글 줄은 버리고, 이메일 열은 @로 찾고, 셀 안 줄바꿈은 공백으로
        onbeforepaste: (_inst, matrix, x, y) => {
          pasteRef.current = null;
          if (Number(x) !== COL.name || (matrix[0]?.length ?? 0) < 2) return undefined;
          const parsed = parsePasteTable(matrix.map((r) => r.map((c) => String(c.value ?? ""))));
          if (!parsed.rows.length) return undefined;
          pasteRef.current = { y0: Number(y), n: parsed.rows.length };
          setNotice(parsed.warnings[0] ?? null);
          return parsed.rows.map((r) => [r.name, r.email, r.teamText]) as unknown as string;
        },
        // 사람이 고르거나 붙여넣은 줄은 계산 열을 비우고 새로 분석(앞 사람의 팀 선택이 남지 않게)
        onpaste: (inst) => {
          const pasted = pasteRef.current;
          pasteRef.current = null;
          if (!pasted) return;
          const ys = Array.from({ length: pasted.n }, (_, k) => pasted.y0 + k);
          busyRef.current = true;
          inst.ignoreHistory = true;
          try {
            for (const y of ys) {
              for (const x of [COL.team, COL.auto, COL.hint, COL.status]) inst.setValueFromCoords(x, y, "", true);
              // 붙여넣은 줄의 권한은 도구줄에서 고른 기본 권한(성과관리팀은 고른 것이 곧 확인이라 바로 체크)
              inst.setValueFromCoords(COL.role, y, defaultRoleRef.current, true);
              inst.setValueFromCoords(COL.pick, y, defaultRoleRef.current === ROLE_VALUE.pmo, true);
            }
          } finally {
            inst.ignoreHistory = false;
            busyRef.current = false;
          }
          setResults(null);
          schedule();
        },
        onchange: (inst, _cell, x, y, value) => {
          if (busyRef.current) return;
          // 권한을 바꾸면: 성과관리팀은 바로 체크(고름이 곧 확인), 부서 담당자로 되돌리면 팀·체크를 비우고 다시 분석
          if (Number(x) === COL.role) {
            busyRef.current = true;
            inst.ignoreHistory = true;
            try {
              const pmo = value === ROLE_VALUE.pmo;
              if (!pmo) {
                inst.setValueFromCoords(COL.team, Number(y), "", true);
                inst.setValueFromCoords(COL.auto, Number(y), "", true);
              }
              inst.setValueFromCoords(COL.pick, Number(y), pmo, true);
            } finally {
              inst.ignoreHistory = false;
              busyRef.current = false;
            }
          }
          // 사람이 팀을 고르면 그 줄을 반영 대상으로 체크(고름이 곧 확인)
          if (Number(x) === COL.team) {
            busyRef.current = true;
            inst.ignoreHistory = true;
            try {
              inst.setValueFromCoords(COL.pick, Number(y), Boolean(value), true);
            } finally {
              inst.ignoreHistory = false;
              busyRef.current = false;
            }
          }
          setResults(null);
          schedule();
        },
        ondeleterow: schedule,
        oninsertrow: schedule,
        onundo: schedule,
        onredo: schedule,
        // 우클릭 메뉴는 줄 끼우기·지우기·복사·붙여넣기만
        contextMenu: (_inst, _x, _y, _e, items) => items.filter((i) => typeof i.title === "string" && /줄|복사|붙여넣기/.test(i.title)),
        worksheets: [
          {
            data: emptyRows(),
            minDimensions: [9, SHEET_ROWS],
            minSpareRows: 1,
            columnSorting: false,
            columnDrag: false,
            allowInsertColumn: false,
            allowDeleteColumn: false,
            allowRenameColumn: false,
            allowComments: false,
            tableOverflow: true,
            tableWidth: Math.max(520, host.clientWidth),
            tableHeight: Math.max(320, window.innerHeight - 260),
            defaultRowHeight: 20,
            defaultColAlign: "left",
            // 엑셀처럼 열 글자(A·B·C…) 줄을 열 이름 줄 위에 둠
            nestedHeaders: [Array.from({ length: propsRef.current.actorRole === "admin" ? 8 : 7 }, (_, i) => ({ title: String.fromCharCode(65 + i), colspan: 1 }))],
            columns: [
              { type: "text", title: "이름", width: 110 },
              { type: "text", title: "이메일", width: 210 },
              { type: "text", title: "팀명 (엑셀에 적힌 그대로)", width: 190 },
              // 권한 칸은 관리자에게만 보임(성과관리팀 사용자에게는 숨은 칸 — 늘 부서 담당자)
              propsRef.current.actorRole === "admin"
                ? {
                    type: "dropdown" as const,
                    title: "권한",
                    width: 110,
                    source: [
                      { id: ROLE_VALUE.dept, name: ROLE_LABEL[ROLE_VALUE.dept] },
                      { id: ROLE_VALUE.pmo, name: ROLE_LABEL[ROLE_VALUE.pmo] },
                    ],
                    render: tone("role"),
                  }
                : { type: "hidden" as const, title: "권한" },
              { type: "dropdown", title: "팀 (추천·확정)", width: 230, source, autocomplete: true, render: tone("team") },
              { type: "text", title: "추천 후보 · 근거", width: 270, readOnly: true },
              { type: "text", title: "상태", width: 130, readOnly: true, render: tone("status") },
              { type: "checkbox", title: "반영", width: 56, align: "center", render: pickRender },
              { type: "hidden", title: "auto" },
            ],
          },
        ],
      });
      wsRef.current = sheets[0];
      const box = host.parentElement ?? host;
      const fit = () => {
        const content = host.querySelector<HTMLElement>(".jss_content");
        if (!content || box.clientWidth <= 0) return;
        content.style.width = `${box.clientWidth}px`;
        content.style.height = `${box.clientHeight}px`;
        content.style.maxHeight = `${box.clientHeight}px`;
      };
      fit();
      resizeRef.current = new ResizeObserver(fit);
      resizeRef.current.observe(box);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      resizeRef.current?.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (lookupRef.current) clearTimeout(lookupRef.current);
      if (js && host) {
        try {
          js.destroy(host as unknown as jspreadsheet.JspreadsheetInstanceElement, true);
        } catch {
          // 이미 정리됨
        }
      }
      wsRef.current = null;
    };
  }, [schedule]);

  // ── 요약·반영 ──
  const live = outs.filter((o) => !o.blank);
  const picked = outs.filter((o) => o.applicable && o.pick && o.input);
  const summary = {
    pmo: live.filter((o) => o.role === ROLE_VALUE.pmo && o.applicable && o.pick).length,
    rows: live.length,
    confirmed: live.filter((o) => o.applicable && o.pick && o.teamTone === "ok").length,
    review: live.filter((o) => o.teamTone === "warn").length,
    skipped: live.filter((o) => o.statusTone === "skip" || o.statusTone === "err").length,
  };
  const cards = picked.reduce((n, o) => n + (o.input?.teamId ? (teams.find((t) => t.id === o.input!.teamId)?.cards ?? 0) : 0), 0);

  const apply = () => {
    startApply(async () => {
      const res = await applyUserPaste(
        picked.map((o) => o.input!),
        { autoAssign },
      );
      if (!res.ok) {
        setNotice(res.message);
        return;
      }
      setNotice(null);
      setResults(res.rows);
    });
  };

  /** 「추천 모두 적용」: 추천만 채워 둔 줄(노랑)은 체크하고, 팀 칸이 빈 줄은 분명한 추천 1순위를 넣고 체크(누른 것이 곧 확인) */
  const suggestable = (o: GridRowOut) => !o.blank && ((o.team !== "" && o.teamTone === "warn" && !o.pick) || (o.team === "" && o.suggest !== ""));
  const applySuggestions = () => {
    const ws = wsRef.current;
    if (!ws) return;
    busyRef.current = true;
    try {
      outs.forEach((o, y) => {
        if (!suggestable(o)) return;
        if (o.team === "") ws.setValueFromCoords(COL.team, y, o.suggest, true);
        ws.setValueFromCoords(COL.pick, y, true, true);
      });
    } finally {
      busyRef.current = false;
    }
    recompute();
  };

  const clearAll = () => {
    wsRef.current?.setData(emptyRows());
    setResults(null);
    setNotice(null);
    recompute();
  };

  /** 반영하지 못한 줄만 격자에 다시 놓기(고른 팀은 팀명으로 채워 다시 자동 확정되게) */
  const retryRemaining = () => {
    const ws = wsRef.current;
    if (!ws || !results) return;
    const done = new Set(results.filter((r) => r.status !== "error" && r.status !== "skipped").map((r) => r.line));
    const data = ws.getData() as unknown[][];
    const rest: (string | boolean)[][] = [];
    data.forEach((cells, y) => {
      const r = gridRowIn(cells);
      if (!r.name && !r.email && !r.teamText) return;
      if (done.has(y + 1)) return;
      rest.push([r.name, r.email, teamName.get(r.team)?.name ?? r.teamText, r.role, "", "", "", r.role === ROLE_VALUE.pmo, ""]);
    });
    ws.setData([...rest, ...emptyRows(Math.max(SHEET_ROWS - rest.length, 2))]);
    setResults(null);
    recompute();
  };

  const okCount = results?.filter((r) => r.status === "created" || r.status === "updated" || r.status === "unchanged").length ?? 0;
  const failed = results ? results.length - okCount : 0;

  const btn = `h-7 border border-[#c8c8c8] bg-[#f3f3f3] px-3 text-[13px] text-[#262626] hover:bg-[#e6e6e6] ${T.off}`;
  const headCell = "border border-[#d4d4d4] bg-[#e6e6e6] px-2 py-0.5 text-left text-[13px] font-normal text-[#444]";
  const bodyCell = "border border-[#d4d4d4] px-2 py-0.5 align-top text-[14px]";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={applySuggestions} disabled={!ready || !outs.some(suggestable)} className={btn}>
          추천 모두 적용
        </button>
        <button type="button" onClick={clearAll} disabled={!ready} className={btn}>
          모두 지우기
        </button>
        {actorRole === "admin" && (
          <label className="flex items-center gap-1.5 text-[13px] text-[#262626]">
            붙여넣는 줄 권한
            <select
              value={defaultRole}
              onChange={(e) => {
                setDefaultRole(e.target.value);
                defaultRoleRef.current = e.target.value;
              }}
              className="h-7 border border-[#c8c8c8] bg-white px-1.5 text-[13px]"
            >
              <option value={ROLE_VALUE.dept}>{ROLE_LABEL[ROLE_VALUE.dept]}</option>
              <option value={ROLE_VALUE.pmo}>{ROLE_LABEL[ROLE_VALUE.pmo]}</option>
            </select>
          </label>
        )}
        <span className="flex items-center gap-3 text-xs text-[#595959]">
          <span>
            <i className="mr-1 inline-block size-2.5 border border-[#a9d8b4] bg-[#c6efce] align-middle" />
            자동 확정
          </span>
          <span>
            <i className="mr-1 inline-block size-2.5 border border-[#ecd77a] bg-[#ffeb9c] align-middle" />
            확인 필요
          </span>
          <span>
            <i className="mr-1 inline-block size-2.5 border border-[#d9d9d9] bg-[#f2f2f2] align-middle" />
            건너뜀
          </span>
          <span>
            <i className="mr-1 inline-block size-2.5 border border-[#eea3ab] bg-[#ffc7ce] align-middle" />
            오류·중복
          </span>
        </span>
      </div>

      <div className="flex min-h-[360px] min-w-0 flex-1 flex-col">
        <div className="paste-grid min-h-0 min-w-0 flex-1 overflow-hidden" aria-label="붙여넣기 표">
          <div ref={hostRef} className="h-full" />
        </div>
        {!results && live.length > 0 && (
          <div role="status" aria-label="분석 요약" className="paste-status flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
            <span>
              입력 <b className="font-mono">{summary.rows}</b>줄
            </span>
            <span title="팀이 정해졌고 반영 체크가 켜진 줄">
              반영 예정 <b className="font-mono">{picked.length}</b>
            </span>
            {summary.pmo > 0 && (
              <span className="text-[#1f4e78]" title="성과관리팀 권한으로 등록할 줄">
                성과관리팀 <b className="font-mono">{summary.pmo}</b>
              </span>
            )}
            <span className={summary.review ? "text-[#9c5700]" : ""} title="추천만 채웠거나 팀을 못 정한 줄 — 팀 칸에서 고르면 자동 체크">
              확인 필요 <b className="font-mono">{summary.review}</b>
            </span>
            <span className="text-[#7f7f7f]" title="이미 성과관리팀·관리자, 사용 중지, 기관 밖 메일, 중복, 형식 오류">
              건너뜀·오류 <b className="font-mono">{summary.skipped}</b>
            </span>
            <label className="ml-auto flex items-center gap-1.5">
              <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} />
              팀 과제 자동 매칭
            </label>
            <button
              type="button"
              disabled={applying || picked.length === 0}
              onClick={apply}
              title={autoAssign ? `팀 과제 ${cards}장(중복 포함)이 담당으로 지정됩니다` : undefined}
              className="h-7 bg-[#217346] px-4 text-[13px] font-semibold text-white hover:bg-[#1b5e3a] disabled:cursor-not-allowed disabled:text-white/50"
            >
              {applying ? "반영 중… (줄마다 계정을 만들어 시간이 걸립니다)" : `선택한 ${picked.length}줄 반영`}
            </button>
          </div>
        )}
      </div>
      {!ready && <p className="text-xs text-muted">표를 불러오는 중…</p>}
      {notice && (
        <p role="status" className="text-xs text-[#9c5700]">
          {notice}
        </p>
      )}

      {results && (
        <section aria-label="반영 결과" className="flex min-w-0 flex-col gap-2">
          <div className="paste-status flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <b>반영 결과</b>
            <span>
              처리 <b className="font-mono">{okCount}</b>줄
            </span>
            <span className={failed ? "text-[#9c0006]" : "text-[#7f7f7f]"}>
              건너뜀·실패 <b className="font-mono">{failed}</b>줄
            </span>
            <span className="ml-auto flex items-center gap-2">
              {failed > 0 && (
                <button type="button" onClick={retryRemaining} className={btn}>
                  반영 못 한 줄 표에 다시 놓기
                </button>
              )}
              <button type="button" onClick={clearAll} className={btn}>
                새로 붙여넣기
              </button>
              <Link href="/users" className="text-sm text-link underline">
                사용자 목록으로
              </Link>
            </span>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse">
              <colgroup>
                <col className="w-12" />
                <col className="w-[28%]" />
                <col className="w-24" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {["줄", "이메일", "결과", "내용"].map((h) => (
                    <th key={h} scope="col" className={headCell}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={`${r.line}-${r.email}`}>
                    <td className={`${bodyCell} font-mono text-xs text-muted`}>{r.line}</td>
                    <td className={`${bodyCell} truncate`} title={r.email}>
                      {r.email}
                    </td>
                    <td className={bodyCell}>
                      <Tag tone={RESULT[r.status].tone}>{RESULT[r.status].label}</Tag>
                    </td>
                    <td className={`${bodyCell} break-keep text-[#595959]`}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
