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

/** 로고는 「경영AI비서」 한 줄입니다. 줄바꿈하지 않습니다. */
export function BrandLogo({ size = "header" }: { size?: "header" | "login" }) {
  const s = size === "login" ? { mark: "size-12", gap: "gap-3", name: "text-figure" } : { mark: "size-[34px]", gap: "gap-2.5", name: "text-title" };
  return (
    <span className={`flex items-center ${s.gap}`}>
      <BrandMark className={`${s.mark} shrink-0`} />
      <span className={`${s.name} font-sans leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-brand-ink`}>경영AI비서</span>
    </span>
  );
}
