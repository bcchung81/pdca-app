// 공통 지식 크기 한도(참고자료 5단계) — 화면(클라이언트 컴포넌트)도 import할 수 있게 별도 파일. 계산은 lib/knowledge/guard.ts.

/** 사업 한 곳의 공유 층 글자 수 상한. 40만 자 ≈ 38만 토큰(글자→토큰 0.92~1.00) — 입력 상한(INPUT_BUDGET 50만 토큰)에서 시스템·카드·첨부·답에 약 12만 토큰을 남김 */
export const SHARED_CHARS_LIMIT = 400_000;
