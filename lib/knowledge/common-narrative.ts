// 관리계획(plan-2607) 서술 Ⅰ·Ⅱ 중 경영관리 월간 점검(지침 13 붙임1)도 근거로 쓰는 공통 조각(순수).
// 서술 조각은 `<경영관리>`로 표시된 것만 트랙 「경영관리」이고 나머지는 적재 때 「주요사업」으로 들어갔지만, 평가 주요 특징·대응방향·지표변화 총괄표·착안사항·산업진흥1팀 총평(경영관리 팀장)처럼
// 두 트랙에 다 해당하는 서술이 많다(지침 13 [붙임1 구성]·[지식파일 지도]가 인용하라고 한 곳). 이름·제목 규칙은 깨지기 쉬워 조각 키를 직접 적고, 시험이 적재 산출물과 맞는지 대조한다.
// 주요사업 전용 서술(지침 13이 근거로 쓰지 말라고 한 곳)은 일부러 뺀다: Ⅰ 2 총평 <주요사업>, Ⅰ 참고4 주요사업 비계량 기관별 득점, Ⅰ 참고6 산업진흥1팀 총평 3/3(주요사업 팀장), Ⅱ 1 주요사업 지표 변화, Ⅱ 참고2 주요사업 계량지표 수정(안).

const NARR = "plan-2607/narr/";

export const MGMT_COMMON_NARRATIVE_KEYS: readonly string[] = [
  "I/1/s1",
  "I/1/s2",
  "I/3/s1",
  "I/3/s2",
  "I/3/s3",
  "I/4/s1",
  "I/ref1/s1",
  "I/ref2/s1",
  "I/ref5/s1",
  "I/ref6/s1",
  "I/ref6/s2",
  "II/2/s1",
  "II/2/s2",
  "II/ref1/s1",
  "II/ref3/s1",
  "II/ref3/s2",
  "II/ref3/s3",
].map((k) => `${NARR}${k}`);

/** 경영관리 월간 점검에 같이 줄 주요사업 트랙 표시 서술 조각인가 */
export const isMgmtCommonNarrative = (chunkKey: string): boolean => MGMT_COMMON_NARRATIVE_KEYS.includes(chunkKey);
