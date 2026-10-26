"use client";

/**
 * 도식·이야기 틀 견본 그림(구성안 화면의 도식 목록·틀 갤러리가 씀): 본문 렌더러가 만든 견본 HTML을 zoom으로 줄여 보여 줍니다.
 * 글은 누르거나 고를 수 없게(pointer-events-none·select-none) 하고, 종이 그림자·여백은 견본에서 지웁니다(outline-view.ts의 SAMPLE_CSS).
 */
export function SampleHtml({ html, css, zoom, center }: { html: string; css?: string; zoom: number; /** 상자 가운데에(작은 도식 견본) — 없으면 위·가운데(긴 틀 견본은 위부터 보이게) */ center?: boolean }) {
  return (
    <div className={`ol-sample pointer-events-none flex h-full w-full justify-center overflow-hidden select-none ${center ? "items-center" : "items-start"}`}>
      {css && <style>{css}</style>}
      {/* 서버(section-html.ts)가 만든 견본 HTML — 사용자 입력이 아니라 이 화면 안 신뢰된 값 */}
      <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
