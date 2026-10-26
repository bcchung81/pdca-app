-- 3차 리뷰 반영: 작성본·보고서 원고도 개정 번호로 동시 편집 보호(같은 부서 두 사람·두 창이 서로 덮지 않게)
alter table public.card_versions add column rev integer not null default 0;
comment on column public.card_versions.rev is '작성본 내용 개정 번호. 저장할 때 불러온 번호와 같을 때만 쓰고 1 올림';
alter table public.reports add column blocks_rev integer not null default 0;
comment on column public.reports.blocks_rev is '보고서 원고(블록) 개정 번호. 저장할 때 불러온 번호와 같을 때만 쓰고 1 올림';
