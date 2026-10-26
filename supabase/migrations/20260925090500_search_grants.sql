-- 검색 함수는 로그인 사용자만 실행합니다(기본 권한으로 anon·public에 열린 실행 권한을 거둠).
revoke execute on function public.search_knowledge(text, text[], text[], text[], text[], text[], integer) from public, anon;
