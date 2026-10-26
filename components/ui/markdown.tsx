"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type MdBlock, type MdInline, foldSections, parseMarkdown } from "../../lib/markdown.ts";

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-bold">
            {p.text}
          </strong>
        ) : p.kind === "italic" ? (
          <em key={i}>{p.text}</em>
        ) : p.kind === "code" ? (
          <code key={i} className="rounded bg-field px-1 font-mono text-[0.92em]">
            {p.text}
          </code>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {p.text}
          </span>
        ),
      )}
    </>
  );
}

const SYMBOL_CLASS: Record<string, string> = {
  "◆": "font-bold text-navy",
  "■": "font-bold text-navy",
  "▣": "font-bold text-navy",
  "□": "mt-0.5 font-semibold text-ink",
  "▸": "pl-3 text-ink",
  "▶": "pl-3 text-ink",
  "○": "pl-1 text-muted-2",
  "●": "pl-1 text-ink",
  "◇": "pl-1 text-ink",
  "※": "pl-3 text-xs text-muted-2",
  "★": "font-semibold text-ink",
};

function Block({ b }: { b: MdBlock }): ReactNode {
  switch (b.kind) {
    case "heading": {
      const cls = b.level === 1 ? "mt-1 text-base font-bold text-navy" : b.level === 2 ? "mt-1 text-sm font-bold text-navy" : "mt-0.5 text-ui font-bold text-ink";
      return (
        <p role="heading" aria-level={b.level + 2} className={cls}>
          <Inline parts={b.inline} />
        </p>
      );
    }
    case "symbol":
      return (
        <p className={SYMBOL_CLASS[b.mark] ?? "text-ink"}>
          {b.mark} <Inline parts={b.inline} />
        </p>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag className={`${b.ordered ? "list-decimal" : "list-disc"} flex flex-col gap-0.5 pl-5`}>
          {b.items.map((it, i) => (
            <li key={i} style={it.depth ? { marginLeft: `${it.depth}em` } : undefined}>
              <Inline parts={it.inline} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 border-line-strong pl-3 text-muted-2">
          <Inline parts={b.inline} />
        </blockquote>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          {/* 열이 많으면 칸마다 글이 잘게 끊기지 않게 열 수에 맞춘 최소 폭 + 가로 스크롤 */}
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${Math.max(320, Math.max(b.head.length, b.rows[0]?.length ?? 0) * 118)}px` }}>
            {b.head.length > 0 && (
              <thead>
                <tr>
                  {b.head.map((c, i) => (
                    <th key={i} scope="col" className="border border-line bg-thead px-1.5 py-1 text-left align-top font-semibold text-muted-2">
                      <Inline parts={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-line px-1.5 py-1 align-top break-keep">
                      <Inline parts={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr className="border-line" />;
    case "code":
      return <pre className="overflow-x-auto rounded bg-field p-2 font-mono text-xs whitespace-pre-wrap">{b.text}</pre>;
    default:
      return (
        <p className="text-ink">
          <Inline parts={b.inline} />
        </p>
      );
  }
}

/**
 * AI 답 마크다운 보기(원문 HTML은 글자로 둠 — React 요소로만 그림). size="md"는 읽기용 본문(AI 작성지원·대화 응답), sm은 좁은 여백 메모.
 * 줄 높이 1.6·블록 사이 4px(2026-09-29 사용자 결정 — 예전 2.0배·8px은 성겼음).
 * fold: ◆ 절(절 머리가 둘 이상일 때) 중 첫 절만 펼치고 나머지는 머리만 — 머리나 ▾를 누르면 그 절을 펼침. 첫 머리 앞 글과 맺음 글은 늘 보임(lib/markdown.ts foldSections)
 */
export function Markdown({ text, className = "", size = "sm", fold = false }: { text: string; className?: string; size?: "sm" | "md"; fold?: boolean }) {
  const blocks = parseMarkdown(text);
  const parts = fold ? foldSections(blocks) : null;
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const box = `flex min-w-0 flex-col gap-1 break-keep leading-[1.6] ${size === "md" ? "text-sm" : "text-ui"} ${className}`;
  if (!parts)
    return (
      <div className={box}>
        {blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </div>
    );
  return (
    <div className={box}>
      {parts.intro.map((b, i) => (
        <Block key={`i${i}`} b={b} />
      ))}
      {parts.sections.map((sec, i) => {
        const on = open[i] ?? i === 0;
        const toggle = () => setOpen((o) => ({ ...o, [i]: !on }));
        return (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-1">
              {/* 머리 글을 눌러도 펼침(키보드는 옆 단추) */}
              <div className="min-w-0 grow cursor-pointer" onClick={toggle}>
                <Block b={sec.head} />
              </div>
              {sec.body.length > 0 && (
                <button type="button" aria-expanded={on} onClick={toggle} aria-label={on ? "이 절 접기" : "이 절 펼치기"} title={on ? "이 절 접기" : `이 절 펼치기 · ${sec.body.length}줄`} className="mt-px flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-thead hover:text-navy">
                  <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${on ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {on && sec.body.map((b, j) => <Block key={j} b={b} />)}
          </div>
        );
      })}
      {parts.outro.map((b, i) => (
        <Block key={`o${i}`} b={b} />
      ))}
    </div>
  );
}
