"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import type { AssignCard } from "../../../lib/users/service.ts";
import { type UserFormState, inviteUser, setUserActive, setUserAssignments, updateUser } from "./actions";
import { T } from "../../../components/ui/kit";

type Team = { id: number; name: string; hq: string | null };
const ROLE_OPTIONS = [
  { value: "dept_user", label: "부서 담당자" },
  { value: "pmo", label: "성과관리팀" },
  { value: "admin", label: "관리자" },
];

const field = "h-9 w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 text-sm text-ink";
const label = "flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted";
const primary = `h-9 rounded-md border border-navy bg-navy px-4 text-sm font-semibold text-white ${T.off}`;
const ghost = `h-9 rounded-md border border-field-line bg-paper px-3 text-sm font-medium text-ink hover:border-navy ${T.off}`;

/** 본부별로 묶은 팀 선택 */
function TeamSelect({ teams, value, required }: { teams: Team[]; value: number | null; required?: boolean }) {
  const groups = useMemo(() => {
    const by = new Map<string, Team[]>();
    for (const t of teams) by.set(t.hq ?? "본부 없음", [...(by.get(t.hq ?? "본부 없음") ?? []), t]);
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [teams]);
  return (
    <select name="team_id" defaultValue={value ?? ""} required={required} className={field}>
      <option value="">{required ? "팀을 골라 주세요" : "부서 없음"}</option>
      {groups.map(([hq, list]) => (
        <optgroup key={hq} label={hq}>
          {list.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  return (
    <select name="role" defaultValue={value} onChange={(e) => onChange?.(e.target.value)} className={field}>
      {ROLE_OPTIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function Result({ state }: { state: UserFormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-error" : "text-muted-2"}`}>
      {state.message}
    </p>
  );
}

/** 옆 창: 한 사람의 이름·부서(·관리자만 역할) */
export function UserEditForm({
  user,
  teams,
  isMe,
  isAdmin,
}: {
  user: { id: string; email: string; displayName: string; role: string; teamId: number | null };
  teams: Team[];
  isMe: boolean;
  isAdmin: boolean;
}) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(updateUser, { status: "idle" });
  const [role, setRole] = useState(user.role);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={user.id} />
      <p className="truncate text-sm text-muted-2" title={user.email}>
        {user.email}
        {isMe ? " · 나" : ""}
      </p>
      <label className={label}>
        이름·직위
        <input name="display_name" defaultValue={user.displayName} placeholder="예: 홍길동 차장" className={field} />
      </label>
      <label className={label}>
        팀
        <TeamSelect teams={teams} value={user.teamId} required={role === "dept_user"} />
      </label>
      {isAdmin ? (
        <label className={label}>
          역할
          <RoleSelect value={user.role} onChange={setRole} />
        </label>
      ) : null}
      <p className="text-xs leading-5 text-muted">팀을 바꾸면 이전 팀의 담당 과제는 해제되고, 새 팀의 과제가 담당으로 지정됩니다.</p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "저장 중…" : "저장"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** 옆 창: 계정 미리 만들기(메일은 보내지 않음). 성과관리팀은 부서 담당자만 */
export function InviteForm({ teams, isAdmin }: { teams: Team[]; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(inviteUser, { status: "idle" });
  const [role, setRole] = useState("dept_user");
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={label}>
        메일
        <input name="email" type="email" required placeholder="이름@kca.kr" className={field} />
      </label>
      <label className={label}>
        이름·직위
        <input name="display_name" required placeholder="예: 홍길동 차장" className={field} />
      </label>
      <label className={label}>
        팀
        <TeamSelect teams={teams} value={null} required={role === "dept_user"} />
      </label>
      {isAdmin ? (
        <label className={label}>
          역할
          <RoleSelect value="dept_user" onChange={setRole} />
        </label>
      ) : (
        <p className="text-xs text-muted">역할: 부서 담당자 (성과관리팀·관리자 계정은 관리자가 만듭니다)</p>
      )}
      <p className="text-xs leading-5 text-muted">메일은 보내지 않습니다. 만든 뒤 그 사람이 로그인 화면에서 메일 링크를 받아 들어옵니다. 부서 담당자는 고른 팀의 과제가 담당으로 지정되고, 담당으로 지정된 과제만 보입니다.</p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "만드는 중…" : "계정 만들기"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** 옆 창: 사용 중지(삭제)·복구. 눌러도 바로 하지 않고 한 번 더 확인 */
export function ActiveToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = () =>
    start(async () => {
      const r = await setUserActive(id, !active);
      setMsg({ ok: r.ok, text: r.message });
      setAsk(false);
    });
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-xs font-semibold text-muted">{active ? "삭제(사용 중지)" : "사용 중지된 계정"}</h3>
      <p className="text-xs leading-5 text-muted">
        {active
          ? "기록이 남은 계정은 지울 수 없어 사용을 중지합니다. 로그인과 화면·데이터 접근이 막히고, 언제든 복구할 수 있습니다."
          : "이 계정은 로그인과 화면·데이터 접근이 막혀 있습니다. 복구하면 다시 쓸 수 있습니다(담당 과제는 다시 지정해 주세요)."}
      </p>
      {ask ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm text-ink">{name}의 사용을 중지할까요?</span>
          <button type="button" disabled={pending} onClick={run} className="h-9 shrink-0 rounded-md bg-error px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:text-white/50">
            {pending ? "처리 중…" : "중지"}
          </button>
          <button type="button" disabled={pending} onClick={() => setAsk(false)} className={ghost}>
            취소
          </button>
        </div>
      ) : (
        <div>
          <button type="button" disabled={pending} onClick={active ? () => setAsk(true) : run} className={active ? `h-9 rounded-md border border-error bg-paper px-3 text-sm font-medium text-error ${T.off}` : primary}>
            {active ? "사용 중지" : pending ? "복구 중…" : "복구"}
          </button>
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-muted-2" : "text-error"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/** 옆 창: 담당 과제(그 사람 팀의 과제 중에서 고름). 한 사람은 여러 과제, 한 과제는 여러 명이 담당할 수 있음 */
export function AssignmentEditor({ userId, teamName, cards }: { userId: string; teamName: string; cards: AssignCard[] }) {
  const [selected, setSelected] = useState(() => new Set(cards.filter((c) => c.assigned).map((c) => c.id)));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const groups = useMemo(() => {
    const by = new Map<string, AssignCard[]>();
    for (const c of cards) by.set(c.business, [...(by.get(c.business) ?? []), c]);
    return [...by.entries()];
  }, [cards]);
  const initial = useMemo(() => new Set(cards.filter((c) => c.assigned).map((c) => c.id)), [cards]);
  const dirty = selected.size !== initial.size || [...selected].some((id) => !initial.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const save = () =>
    start(async () => {
      const r = await setUserAssignments(userId, [...selected]);
      setMsg({ ok: r.ok, text: r.message });
    });
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted">담당 과제</h3>
        <span className="font-mono text-xs text-muted">
          {selected.size} / {cards.length}장
        </span>
      </div>
      <p className="text-xs leading-5 text-muted">
        {teamName}의 과제 중 이 사람이 담당하는 과제를 고릅니다. 이 사람은 여기서 지정한 과제만 보고 쓸 수 있습니다(지정하지 않은 과제는 같은 팀이어도 보이지 않음). 한 과제에 여러 명을 지정할 수 있습니다.
      </p>
      <div className="flex gap-2">
        <button type="button" className="text-xs text-link underline" onClick={() => setSelected(new Set(cards.map((c) => c.id)))}>
          모두 선택
        </button>
        <button type="button" className="text-xs text-link underline" onClick={() => setSelected(new Set())}>
          모두 해제
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-line">
        {groups.map(([business, list]) => (
          <fieldset key={business} className="border-b border-row-line last:border-b-0">
            <legend className="sr-only">{business}</legend>
            <div className="bg-thead px-3 py-1.5 text-xs font-semibold text-muted">{business || "사업 미지정"}</div>
            {list.map((c) => (
              <label key={c.id} className="flex min-w-0 cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-row-hover">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 shrink-0" />
                <span className="shrink-0 font-mono text-xs leading-6 text-muted-2">{c.taskNo}</span>
                <span className="min-w-0 break-keep text-ink">{c.title}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {cards.length === 0 && <p className="px-3 py-4 text-sm text-muted">이 팀에 활성 과제가 없습니다.</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending || !dirty} onClick={save} className={primary}>
          {pending ? "저장 중…" : "담당 과제 저장"}
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`min-w-0 text-sm ${msg.ok ? "text-muted-2" : "text-error"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
