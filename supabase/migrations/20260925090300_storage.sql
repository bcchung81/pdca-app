-- 파일 저장소(비공개 버킷 2개). 경로 키는 ASCII만 씁니다.
--  card-materials/{cards.uid}/{card_materials.id} — 카드 전용 자료(카드 권한 그대로)
--  knowledge/{doc_id}/{파일} — 공통 지식 원본(읽기 로그인 사용자, 쓰기 성과관리팀·관리자)
-- 보고서 추가자료 버킷은 보고서 스키마와 함께 만듭니다.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('card-materials', 'card-materials', false, 52428800),
  ('knowledge', 'knowledge', false, 104857600)
on conflict (id) do nothing;

create or replace function private.card_id_by_uid(p_uid text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.cards c where c.uid::text = p_uid
$$;

grant execute on function private.card_id_by_uid(text) to authenticated;

create policy card_materials_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'card-materials' and private.can_read_card(private.card_id_by_uid((storage.foldername(name))[1])));
create policy card_materials_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'card-materials' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])));
create policy card_materials_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'card-materials' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])));

create policy knowledge_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'knowledge');
create policy knowledge_objects_write on storage.objects for all to authenticated
  using (bucket_id = 'knowledge' and private.is_staff())
  with check (bucket_id = 'knowledge' and private.is_staff());
