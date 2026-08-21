import { getAdminClient } from "./supabaseAdmin.js";

export interface JournalMetric {
  issn: string;
  title: string | null;
  is_scie: boolean;
  sjr: number | null;
  sjr_quartile: string | null;
  citescore: number | null;
  h_index: number | null;
  categories: string | null;
}

// 논문의 ISSN 목록 → 저널 지표 (여러 ISSN 중 첫 매칭)
export async function lookupJournals(
  issnLists: string[][]
): Promise<Map<string, JournalMetric>> {
  const all = [...new Set(issnLists.flat())];
  const byIssn = new Map<string, JournalMetric>();
  if (all.length === 0) return byIssn;

  const supabase = getAdminClient();
  // IN 절이 너무 커지지 않도록 청크 처리
  const chunkSize = 200;
  for (let i = 0; i < all.length; i += chunkSize) {
    const chunk = all.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("journal_metrics")
      .select("issn,title,is_scie,sjr,sjr_quartile,citescore,h_index,categories")
      .in("issn", chunk);
    if (error) throw new Error(`journal_metrics 조회 실패: ${error.message}`);
    for (const row of data ?? []) byIssn.set(row.issn, row as JournalMetric);
  }
  return byIssn;
}

// 논문의 ISSN 배열에서 대표 지표 1건 선택 (SCIE 우선 → SJR 높은 것)
export function pickMetric(
  issns: string[],
  table: Map<string, JournalMetric>
): JournalMetric | null {
  const hits = issns.map((i) => table.get(i)).filter(Boolean) as JournalMetric[];
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    if (a.is_scie !== b.is_scie) return a.is_scie ? -1 : 1;
    return (b.sjr ?? 0) - (a.sjr ?? 0);
  });
  return hits[0];
}

const QUARTILE_RANK: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

// 최소 분위 조건 통과 여부 (min 이 null 이면 항상 통과)
export function passesQuartile(metric: JournalMetric | null, min: string | null): boolean {
  if (!min) return true;
  if (!metric?.sjr_quartile) return false;
  return (QUARTILE_RANK[metric.sjr_quartile] ?? 99) <= (QUARTILE_RANK[min] ?? 0);
}
