-- 과제관리카드 원본 양식에 든 그림(비공개). 경로 card-originals/{cards.uid}/{파일}. 읽기는 카드 권한 그대로,
-- 쓰기는 적재 스크립트(서비스 키)와 성과관리팀·관리자만.
insert into storage.buckets (id, name, public, file_size_limit)
values ('card-originals', 'card-originals', false, 10485760)
on conflict (id) do nothing;

create policy card_originals_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'card-originals' and private.can_read_card(private.card_id_by_uid((storage.foldername(name))[1])));
create policy card_originals_objects_write on storage.objects for all to authenticated
  using (bucket_id = 'card-originals' and private.is_staff())
  with check (bucket_id = 'card-originals' and private.is_staff());
