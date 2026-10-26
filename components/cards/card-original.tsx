/** 카드 판 표기 "260916" → "2026.9.16" */
export function editionLabel(edition: string): string {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(edition);
  return m ? `20${m[1]}.${Number(m[2])}.${Number(m[3])}` : edition;
}
