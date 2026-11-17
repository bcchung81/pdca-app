-- 저장소(Storage) 쓰기 정책에 앱 서버 경유 표지(2026-11-18 웹 취약점 낮음 보완 — 근거 T2-F1·T4-S1).
--
-- 무엇을: storage.objects의 로그인 사용자 쓰기 정책 9개(넣기 4·지우기 3·FOR ALL 2)에 「and private.app_write()」를 더합니다.
--   이름·행 판정은 예전 그대로이고 읽기 정책 5개(…_objects_read)는 바꾸지 않습니다. 그래서 로그인 사용자가 공개 키 + 자기 토큰으로
--   Storage API를 직접 불러 파일을 넣거나 지우지 못하고(행 없는 파일·파일 없는 행이 생기지 않음), 앱 서버(서버 액션)를 거친 요청만 통과합니다.
--   FOR ALL 두 정책(knowledge_objects_write·card_originals_objects_write)은 USING에도 표지가 붙지만 같은 사람에게 더 넓은 읽기 정책이
--   따로 있어(knowledge_objects_read is_member ⊇ is_admin, card_originals_objects_read can_read_card ⊇ is_staff) 읽기는 줄지 않습니다.
--
-- 걸 수 있는 근거(supabase/storage 원본, v1.97.0 — request.headers 넣기는 v0.40.0부터 같은 코드):
--   ① Storage 서버는 요청 머리글 전체를 JSON으로 그 요청의 DB 트랜잭션 request.headers에 넣고 RLS를 그 세션에서 판정함
--      (src/http/plugins/db.ts headers: request.headers → src/internal/database/postgres/scope.ts set_config('request.headers', …)).
--      supabase-js는 global.headers를 Storage 요청에도 실음(lib/supabase/server.ts·job-client.ts의 x-app-write가 같이 감).
--   ② 서명 업로드 주소 만들기(createSignedUploadUrl — 서버 액션)는 그 요청의 사용자 권한으로 넣기 정책을 되돌리는 트랜잭션에서 시험하고
--      (src/storage/object.ts signUploadObjectUrl → uploader.ts canUpload·authorizeUpload), 그 주소로 올리기(uploadToSignedUrl — 브라우저)는
--      토큰만 확인하고 서비스 역할로 씀(src/http/routes/object/index.ts dbSuperUser 묶음 · uploadSignedObject.ts asSuperUser) → 표지와 무관.
--   ③ 지우기(remove)·복사(copy)·서버 올리기(upload)도 같은 사용자 세션에서 정책을 판정(지우기는 권한 없는 이름을 오류 없이 건너뜀).
--   브라우저가 저장소에 쓰는 호출은 서명 주소 올리기 셋뿐(components/ui/file-drop.tsx·components/cards/import/card-file-upload.tsx·
--   components/admin/library-upload.tsx). 서비스 키(적재 스크립트)는 RLS 밖이라 영향 없음.
--
-- 운영 반영 순서: 배포 없이 db:push 하나(앱 서버는 2026-11-17 배포부터 Storage 요청에도 머리글을 실음 — 코드 변경 불필요).
--   push 직후 확인: 관리자 계정으로 시험 카드에 「카드 전용 자료」 하나 올리기 → 지우기. 「올릴 수 없습니다」가 나오면
--   운영 관문이 Storage에 머리글을 넘기지 않는 것(호스티드 판·관문은 원본으로 확인하지 못함)이므로 아래 되돌리기를 바로 실행합니다.
--   서버 로그 kind = storage_remove_failed(lib/storage/remove.ts)가 늘어도 같은 신호입니다.
--
-- 되돌리기(down — 표지만 뺀 예전 정의):
--   drop policy card_materials_objects_insert on storage.objects;
--   create policy card_materials_objects_insert on storage.objects for insert to authenticated
--     with check (bucket_id = 'card-materials' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])));
--   drop policy card_materials_objects_delete on storage.objects;
--   create policy card_materials_objects_delete on storage.objects for delete to authenticated
--     using (bucket_id = 'card-materials' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])) and not private.card_material_locked(name));
--   drop policy knowledge_objects_write on storage.objects;
--   create policy knowledge_objects_write on storage.objects for all to authenticated
--     using (bucket_id = 'knowledge' and private.is_admin()) with check (bucket_id = 'knowledge' and private.is_admin());
--   drop policy card_originals_objects_write on storage.objects;
--   create policy card_originals_objects_write on storage.objects for all to authenticated
--     using (bucket_id = 'card-originals' and private.is_staff()) with check (bucket_id = 'card-originals' and private.is_staff());
--   drop policy card_imports_objects_insert on storage.objects;
--   create policy card_imports_objects_insert on storage.objects for insert to authenticated
--     with check (bucket_id = 'card-imports' and private.can_use_import(private.import_id_from_path(name)));
--   drop policy card_imports_objects_delete on storage.objects;
--   create policy card_imports_objects_delete on storage.objects for delete to authenticated
--     using (bucket_id = 'card-imports' and private.is_staff());
--   drop policy card_originals_objects_import on storage.objects;
--   create policy card_originals_objects_import on storage.objects for insert to authenticated
--     with check (bucket_id = 'card-originals' and storage.filename(name) like 'imp%' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])));
--   drop policy report_materials_objects_insert on storage.objects;
--   create policy report_materials_objects_insert on storage.objects for insert to authenticated
--     with check (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)));
--   drop policy report_materials_objects_delete on storage.objects;
--   create policy report_materials_objects_delete on storage.objects for delete to authenticated
--     using (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)));

-- 카드 전용 자료(card-materials/{cards.uid}/…) — 20260925090300 · 지우기는 20261104100000(근거 잠금)
drop policy card_materials_objects_insert on storage.objects;
create policy card_materials_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-materials'
    and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1]))
    and private.app_write()
  );
drop policy card_materials_objects_delete on storage.objects;
create policy card_materials_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-materials'
    and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1]))
    and not private.card_material_locked(name)
    and private.app_write()
  );

-- 공통 지식 원본(knowledge/…, 관리자) — 20261103100000
drop policy knowledge_objects_write on storage.objects;
create policy knowledge_objects_write on storage.objects for all to authenticated
  using (bucket_id = 'knowledge' and private.is_admin() and private.app_write())
  with check (bucket_id = 'knowledge' and private.is_admin() and private.app_write());

-- 카드 원본 그림(card-originals/{cards.uid}/…) — 성과관리팀·관리자 20260925090700, 부서 현행화 그림(imp…) 넣기 20260925091600
drop policy card_originals_objects_write on storage.objects;
create policy card_originals_objects_write on storage.objects for all to authenticated
  using (bucket_id = 'card-originals' and private.is_staff() and private.app_write())
  with check (bucket_id = 'card-originals' and private.is_staff() and private.app_write());
drop policy card_originals_objects_import on storage.objects;
create policy card_originals_objects_import on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-originals'
    and storage.filename(name) like 'imp%'
    and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1]))
    and private.app_write()
  );

-- 현행화 원본 한글 파일(card-imports/{card_imports.id}/…) — 20260925091600
drop policy card_imports_objects_insert on storage.objects;
create policy card_imports_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'card-imports' and private.can_use_import(private.import_id_from_path(name)) and private.app_write());
drop policy card_imports_objects_delete on storage.objects;
create policy card_imports_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'card-imports' and private.is_staff() and private.app_write());

-- 보고서 추가자료(report-materials/{reports.id}/…) — 20260925091300
drop policy report_materials_objects_insert on storage.objects;
create policy report_materials_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)) and private.app_write());
drop policy report_materials_objects_delete on storage.objects;
create policy report_materials_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-materials' and private.can_edit_report_content(private.report_id_from_path(name)) and private.app_write());
