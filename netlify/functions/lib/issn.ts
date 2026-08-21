// ISSN 정규화: 하이픈/공백 제거, 대문자화(체크디짓 X 대응).
// "1549-9634" -> "15499634"
export function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9X]/g, "");
  return s.length === 8 ? s : null;
}

// 여러 ISSN 후보 중 정규화 성공한 것만 반환 (중복 제거)
export function normalizeIssns(raws: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of raws) {
    const n = normalizeIssn(r);
    if (n) out.add(n);
  }
  return [...out];
}
