"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ChunkImage {
  name: string;
  /** 서명된 주소(비공개 버킷 knowledge — 서버가 만듦, 1시간) */
  url: string;
}

/**
 * 공통 지식 조각의 그림(원본의 그 쪽에 든 그림 — lib/knowledge/images.ts): 작은 그림 목록, 누르면 크게 보기(←→로 넘김, Esc로 닫기).
 * 서명 주소는 서버가 로그인 사용자 권한으로 만듦(버킷 knowledge 읽기는 로그인한 사용자)
 */
export function ChunkImages({ images, label }: { images: ChunkImage[]; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (at !== null && !el.open) el.showModal();
    if (at === null && el.open) el.close();
  }, [at]);

  if (!images.length) return null;
  const cur = at !== null ? images[at] : null;
  const step = (d: number) => setAt((i) => (i === null ? i : (i + d + images.length) % images.length));

  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h3 className="text-xs font-bold text-navy">
        {label} {images.length}
      </h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
        {images.map((img, i) => (
          <li key={img.name}>
            <button type="button" onClick={() => setAt(i)} title="크게 보기" className="group flex h-28 w-full items-center justify-center overflow-hidden rounded-md border border-line bg-thead hover:border-navy">
              {/* eslint-disable-next-line @next/next/no-img-element -- 서명 주소(1시간)라 next/image 최적화·캐시를 쓰지 않음 */}
              <img src={img.url} alt={`${label} ${i + 1}`} loading="lazy" className="max-h-full max-w-full object-contain transition-transform group-hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={ref}
        aria-label={`${label} 크게 보기`}
        onClose={() => setAt(null)}
        onClick={(e) => e.target === ref.current && setAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          else if (e.key === "ArrowLeft") step(-1);
        }}
        className="fixed top-1/2 left-1/2 max-h-[92vh] w-[min(1100px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-paper p-0 shadow-[0_12px_40px_rgba(27,23,96,0.25)] backdrop:bg-ink/60"
      >
        {cur && (
          <div className="flex max-h-[92vh] flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted-2">
              <span>
                {label} {at! + 1} / {images.length}
              </span>
              <a href={cur.url} target="_blank" rel="noreferrer" className="text-link hover:underline">
                원본 크기로 열기
              </a>
              <button type="button" onClick={() => setAt(null)} aria-label="닫기" className="ml-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-row-hover hover:text-navy">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="relative flex min-h-0 grow items-center justify-center bg-thead p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 서명 주소 */}
              <img src={cur.url} alt={`${label} ${at! + 1}`} className="max-h-[80vh] max-w-full object-contain" />
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="이전 그림" className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/90 text-navy hover:bg-paper">
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="다음 그림" className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/90 text-navy hover:bg-paper">
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
