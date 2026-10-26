// 모양이 넓은 외부 경계값(카드 JSON·DB jsonb·kordoc 결과)용 느슨한 타입 별칭.
// 이 별칭은 any와 같아 속성 접근을 막지 않습니다 — 모양을 아는 곳은 좁은 인터페이스를 쓰고,
// 여기에는 카드 JSON처럼 칸이 많아 따로 타입을 만들 수 없는 값만 둡니다. 파일마다 eslint-disable을 흩뿌리지 않으려는 한 곳입니다.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseJson = any;
