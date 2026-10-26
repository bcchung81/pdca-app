// Summit Guide의 봉우리·상승 경로를 유지합니다. 색상은 app/globals.css의 브랜드 토큰을 따릅니다.
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const a11y = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const, focusable: "false" as const };
  return (
    <svg viewBox="0 0 104 100" className={className} {...a11y}>
      <path d="M7 84 49 12a4 4 0 0 1 7 0l41 72H77L53 42 29 84Z" fill="var(--brand-ink)" />
      <path d="m38 84 20-35 10 18-10 17Z" fill="var(--brand-accent)" />
      <path d="M76 13v12m-6-6h12" fill="none" stroke="var(--brand-accent)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** 이름 → 역할 순서. 부제는 헤더에서도 최소 12px을 유지하고 두 줄 모두 줄바꿈하지 않습니다. */
export function BrandLogo({ size = "header" }: { size?: "header" | "login" }) {
  const s = size === "login" ? { mark: "size-12", gap: "gap-3", name: "text-figure", subtitle: "text-sm" } : { mark: "size-[34px]", gap: "gap-2.5", name: "text-title", subtitle: "text-xs" };
  return (
    <span className={`flex items-center ${s.gap}`}>
      <BrandMark className={`${s.mark} shrink-0`} />
      <span className="flex flex-col gap-0.5 font-sans whitespace-nowrap text-brand-ink">
        <span className={`${s.name} leading-none font-semibold tracking-[-0.02em]`}>Sherpa</span>
        <span className={`${s.subtitle} leading-tight font-medium`}>경영평가 Agent</span>
      </span>
    </span>
  );
}
