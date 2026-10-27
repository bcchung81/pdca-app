import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PeekEscape } from "../../../components/shell/peek-escape";
import { LinkTabs, NoAccess, PageHeader, Screen, Toolbar } from "../../../components/ui/kit";
import { type AppRole, ROLE_LABEL, requireAtLeast } from "../../../lib/auth/dal.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { listUsers } from "../../../lib/users/queries.ts";
import { assignmentView } from "../../../lib/users/service.ts";
import { ActiveToggle, AssignmentEditor, InviteForm, UserEditForm } from "./user-forms";

export const metadata: Metadata = { title: "사용자·담당 과제 · 경영AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\s/g, "").replace(/\.$/, "") : "—";
const ROLE_CLASS: Record<AppRole, string> = {
  admin: "border-navy text-navy",
  pmo: "border-link text-link",
  dept_user: "border-field-line text-muted-2",
};
const cell = "border-b border-row-line px-3 whitespace-nowrap";

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const me = await requireAtLeast("pmo", "/users");
  if (!me) return <NoAccess title="사용자·담당 과제" need="성과관리팀" />;
  const isAdmin = me.role === "admin";
  const sp = await searchParams;
  const roleFilter = (["dept_user", "pmo", "admin"] as AppRole[]).find((r) => r === one(sp.role));
  const inactiveOnly = one(sp.status) === "inactive";
  const editId = one(sp.edit);
  const creating = one(sp.new) === "1";
  const { users, teams } = await listUsers();
  const shown = users
    .filter((u) => (roleFilter ? u.role === roleFilter : true) && (inactiveOnly ? !u.active : true))
    .sort((a, b) => Number(b.active) - Number(a.active));
  const editing = editId ? users.find((u) => u.id === editId) : undefined;
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (roleFilter) p.set("role", roleFilter);
    if (inactiveOnly) p.set("status", "inactive");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `/users?${s}` : "/users";
  };
  const closeHref = href({});
  const chips: Array<{ key: string; status?: string; label: string; n: number; on: boolean; to: string }> = [
    { key: "", label: "전체", n: users.length, on: !roleFilter && !inactiveOnly, to: "/users" },
    ...(["dept_user", "pmo", "admin"] as AppRole[]).map((r) => ({
      key: r,
      label: ROLE_LABEL[r],
      n: users.filter((u) => u.role === r).length,
      on: roleFilter === r && !inactiveOnly,
      to: `/users?role=${r}`,
    })),
    { key: "inactive", label: "사용 중지", n: users.filter((u) => !u.active).length, on: inactiveOnly, to: "/users?status=inactive" },
  ];
  const panelOpen = creating || Boolean(editing);
  const createLabel = isAdmin ? "계정 만들기" : "담당자 추가";

  // 옆 창에서 담당 과제를 고르는 대상: 활성 부서 담당자(팀이 있는 사람)
  const canAssign = Boolean(editing && editing.role === "dept_user" && editing.active && editing.teamId !== null);
  const supabase = await createClient();
  const cards = canAssign ? await assignmentView(supabase, editing!.id, editing!.teamId) : [];
  const readOnlyTarget = Boolean(editing && !isAdmin && editing.role !== "dept_user");

  const peek = panelOpen ? (
    <aside
      role="dialog"
      aria-label={creating ? createLabel : "사용자 수정"}
      className="peek-sheet flex w-full max-w-[440px] flex-col border-l border-line-strong bg-paper shadow-peek"
    >
      <PeekEscape closeHref={closeHref} />
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h2 className="truncate font-serif text-lg font-bold text-navy">{creating ? createLabel : editing!.displayName || "이름 미입력"}</h2>
        <Link href={closeHref} scroll={false} aria-label="닫기 (Esc)" title="닫기 (Esc)" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-field-line text-muted no-underline hover:border-navy">
          ✕
        </Link>
      </div>
      <div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-6">
        {creating ? (
          <InviteForm teams={teams} isAdmin={isAdmin} />
        ) : readOnlyTarget ? (
          <div className="flex flex-col gap-2 text-sm text-muted-2">
            <p className="truncate" title={editing!.email}>
              {editing!.email}
            </p>
            <p>
              {ROLE_LABEL[editing!.role]} 계정입니다. 성과관리팀·관리자 계정은 관리자만 바꿀 수 있습니다.
            </p>
          </div>
        ) : (
          <>
            <UserEditForm
              key={editing!.id}
              teams={teams}
              isMe={editing!.id === me.id}
              isAdmin={isAdmin}
              user={{ id: editing!.id, email: editing!.email, displayName: editing!.displayName, role: editing!.role, teamId: editing!.teamId }}
            />
            {editing!.role === "dept_user" && editing!.teamId ? (
              <Link href={`/my?team=${editing!.teamId}`} className="text-xs text-link no-underline hover:underline">
                이 팀 담당자 화면 보기 →
              </Link>
            ) : null}
            {canAssign && <AssignmentEditor key={`${editing!.id}:${cards.filter((c) => c.assigned).map((c) => c.id).join(",")}`} userId={editing!.id} teamName={editing!.teamName ?? ""} cards={cards} />}
            {editing!.id !== me.id && <ActiveToggle key={`${editing!.id}:${editing!.active}`} id={editing!.id} active={editing!.active} name={editing!.displayName || editing!.email} />}
          </>
        )}
      </div>
    </aside>
  ) : undefined;

  return (
    <Screen
      peek={peek}
      header={
        <PageHeader title="사용자·담당 과제" />
      }
    >
      <Toolbar>
        <LinkTabs label="역할" tabs={chips.map((c) => ({ href: c.to, label: c.label, n: c.n, on: c.on }))} />
        <Link
          href={href({ new: "1" })}
          scroll={false}
          aria-label={createLabel}
          title={createLabel}
          className="ml-auto flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-navy text-white no-underline hover:opacity-90"
        >
          <UserPlus size={16} aria-hidden />
        </Link>
      </Toolbar>

        <section aria-label="사용자 목록" className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[24%]" />
                <col />
                <col className="w-[104px]" />
                <col className="w-[92px]" />
                <col className="w-[76px]" />
              </colgroup>
              <thead>
                <tr className="h-10 bg-thead text-left text-xs font-semibold text-muted">
                  {["이름", "메일", "팀", "역할", "담당 과제", "최근 접속"].map((h) => (
                    <th key={h} scope="col" className="border-b border-line px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => {
                  const selected = u.id === editId;
                  return (
                    <tr key={u.id} className={`h-12 ${selected ? "bg-row-hover" : "hover:bg-row-hover"} ${u.active ? "" : "text-muted"}`}>
                      <td className={cell}>
                        <Link href={href({ edit: u.id })} scroll={false} className={`block truncate no-underline hover:underline ${u.displayName && u.active ? "font-semibold text-navy" : "text-muted"}`} title="눌러서 수정">
                          {u.displayName || "이름 미입력"}
                          {u.id === me.id ? <span className="ml-1 text-xs font-normal text-muted">(나)</span> : null}
                          {!u.active ? <span className="ml-1 rounded-chip border border-field-line px-[5px] text-xs font-normal">중지</span> : null}
                        </Link>
                      </td>
                      <td className={`${cell} truncate text-muted-2`} title={u.email}>
                        {u.email}
                      </td>
                      <td className={`${cell} truncate text-muted-2`} title={[u.hq, u.teamName].filter(Boolean).join(" · ")}>
                        {u.teamName ? (
                          <>
                            {u.teamName}
                            {u.hq ? <span className="ml-1 text-xs text-muted">{u.hq}</span> : null}
                          </>
                        ) : (
                          <span className="text-muted">팀 없음</span>
                        )}
                      </td>
                      <td className={cell}>
                        <span className={`rounded-chip border px-[5px] text-xs leading-5 ${ROLE_CLASS[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                      </td>
                      <td className={`${cell} font-mono text-ui text-muted-2`} title={u.cardCount === null ? undefined : `담당 지정 ${u.assignedCount}장 · 팀 과제 ${u.cardCount}장`}>
                        {u.cardCount === null ? "전체" : u.teamId ? `${u.assignedCount}/${u.cardCount}장` : "—"}
                      </td>
                      <td className={`${cell} font-mono text-xs text-muted`}>{fmt(u.lastSignInAt)}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                      해당하는 사용자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
    </Screen>
  );
}
