"use client";

import { usePathname, useRouter } from "next/navigation";

/** 성과관리팀·관리자가 부서 화면을 볼 때 부서 고르기(주소 ?team=) */
export function TeamPicker({ teams, value, allLabel }: { teams: Array<{ id: number; name: string; hq: string | null; cards: number }>; value: number | null; /** 있으면 「부서 고르기」 대신 이 이름의 전체 선택지(내 과제: 모든 부서) */ allLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted">
      부서
      <select
        value={value ?? ""}
        onChange={(e) => router.push(e.target.value ? `${pathname}?team=${e.target.value}` : pathname, { scroll: false })}
        className="h-8 max-w-[260px] min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui font-normal text-ink"
      >
        <option value="">{allLabel ?? "부서 고르기"}</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.hq ? ` · ${t.hq}` : ""} ({t.cards})
          </option>
        ))}
      </select>
    </label>
  );
}
