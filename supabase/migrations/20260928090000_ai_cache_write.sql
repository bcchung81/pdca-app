-- AI 호출 기록에 캐시 쓰기 토큰(2026-09-28 운영 전환 준비 — 사용자 승인 「1~8 진행」).
-- Claude API는 프롬프트 캐시에 처음 쓸 때(cache_creation_input_tokens) 입력 단가보다 비싼 값(5분 캐시 1.25배)을 받는데,
-- 지금까지는 입력·출력·캐시 읽기만 남겨 관리자 「AI 사용량」의 비용 어림이 적게 나왔음. CLI 경로는 이 값이 없으면 0.

alter table public.ai_requests add column cache_write_tokens integer;
comment on column public.ai_requests.cache_write_tokens is '프롬프트 캐시에 쓴 입력 토큰(API cache_creation_input_tokens) — 비용 어림용';
