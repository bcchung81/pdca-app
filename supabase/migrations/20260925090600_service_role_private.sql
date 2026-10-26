-- 적재·관리 스크립트(서비스 키 = service_role)가 profiles·card_versions·inspections를 고칠 때
-- 가드 트리거가 private 함수를 부르므로 service_role에도 스키마 사용·실행 권한을 줍니다.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
