// 코드가 읽는 카드 파일의 영문 이름(순수, 2026-09-28 — 사용자 목표 「기반 파일의 한글 파일명을 권장안으로」).
// 한글 파일명은 macOS 디스크에 자모 분리형(NFD)으로 저장되기도 해 코드의 완성형(NFC) 문자열과 리눅스(Vercel)에서 어긋날 수 있음
// (실측: data/cards/260916 원본 6개가 NFD) — 코드가 경로로 읽는 파일은 영문 이름으로 두고, 카드 id·기관 원본 이름은 데이터로만 씀.

/** 카드 묶음 이름 → 영문(주요사업N → bizN) */
export function groupSlug(group: string): string {
  const m = /^주요사업(\d+)$/.exec(group.normalize("NFC"));
  if (!m) throw new Error(`파일 이름으로 바꿀 수 없는 카드 묶음: ${group}`);
  return `biz${m[1]}`;
}

/** 과제번호 끝 글자(가·나·다 …) → 로마자 — 모르는 한글이 나오면 오류(조용히 틀린 이름을 만들지 않게) */
const SYLLABLE: Record<string, string> = { 가: "ga", 나: "na", 다: "da", 라: "ra", 마: "ma", 바: "ba", 사: "sa", 아: "a", 자: "ja", 차: "cha", 카: "ka", 타: "ta", 파: "pa", 하: "ha" };

export function taskSlug(taskNo: string): string {
  return taskNo.normalize("NFC").replace(/[가-힣]/g, (c) => {
    const s = SYLLABLE[c];
    if (!s) throw new Error(`파일 이름으로 바꿀 수 없는 과제번호 글자: ${c}(${taskNo})`);
    return s;
  });
}

/** 카드 → 파일 이름 줄기(주요사업1 · 1-가 → biz1_1-ga) — 정적 조각(seed/cards/<판>/static/<줄기>.html) 등 */
export const cardFileStem = (group: string, taskNo: string) => `${groupSlug(group)}_${taskSlug(taskNo)}`;

/** 카드 원본 한글 파일(data/cards/<판> — 기관 원본이라 git 밖): 묶음마다 영문 파일 이름과 기관이 준 원래 이름 */
export interface CardSourceFile {
  group: string;
  /** data/cards/<판>/ 아래 파일 이름 */
  hwp: string;
  pdf: string;
  /** 기관 원본 파일 이름(확장자 빼고) — 새 판이 오면 이 이름의 파일을 hwp·pdf 이름으로 바꿔 둠 */
  original: string;
}

export function cardSourceFiles(edition = "260916", groups = [1, 2, 3]): CardSourceFile[] {
  return groups.map((n) => ({ group: `주요사업${n}`, hwp: `cards-${edition}-biz${n}.hwp`, pdf: `cards-${edition}-biz${n}.pdf`, original: `(${edition}) 과제관리카드(주요사업${n})★` }));
}

/** 묶음 번호 → 카드 원본 파일 이름 */
export const cardSourceFile = (n: number, ext: "hwp" | "pdf" = "hwp", edition = "260916") => `cards-${edition}-biz${n}.${ext}`;
