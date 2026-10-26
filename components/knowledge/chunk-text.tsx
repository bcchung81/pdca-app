import { Fragment } from "react";
import { type RichCell, parseChunkBlocks } from "../../lib/knowledge/rich-text.ts";

/**
 * 공통 지식 조각 글 보기: 제목·문단·표(kordoc의 HTML 표와 마크다운 파이프 표 둘 다)를 React 요소로만 그림(HTML을 그대로 넣지 않음).
 * 그림 참조는 걷고(그림은 조각 meta.images가 따로 보여 줌), 문단 사이 빈 줄은 한 번의 간격으로 줄임.
 * 한컴 전용 기호(사용자 영역 문자)는 글꼴에 없어 네모로 보일 수 있습니다.
 */
export function ChunkText({ text, className = "" }: { text: string; className?: string }) {
  const lines = (t: string) =>
    t.split("\n").map((l, i, a) => (
      <Fragment key={i}>
        {l}
        {i < a.length - 1 && <br />}
      </Fragment>
    ));
  const cell = (c: RichCell, k: number) =>
    c.head ? (
      <th key={k} colSpan={c.colspan} rowSpan={c.rowspan} scope="col" className="border border-line bg-thead px-2 py-1 text-left align-top font-semibold break-keep text-muted-2">
        {lines(c.text)}
      </th>
    ) : (
      <td key={k} colSpan={c.colspan} rowSpan={c.rowspan} className="border border-line px-2 py-1 align-top break-keep">
        {lines(c.text)}
      </td>
    );
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 text-sm leading-7 text-ink ${className}`}>
      {parseChunkBlocks(text).map((b, i) => {
        if (b.kind === "heading") return b.level <= 2 ? (
          <h4 key={i} className="mt-1 text-base leading-6 font-bold break-keep text-navy">
            {b.text}
          </h4>
        ) : (
          <h5 key={i} className="mt-0.5 text-sm leading-6 font-semibold break-keep text-navy">
            {b.text}
          </h5>
        );
        if (b.kind === "para")
          return (
            <p key={i} className="break-keep whitespace-pre-wrap">
              {b.text}
            </p>
          );
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-ui leading-6">
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>{row.map(cell)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
