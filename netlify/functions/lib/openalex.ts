import { normalizeIssns } from "./issn.js";

// OpenAlex 에서 가져온 논문 1건 (정규화된 형태)
export interface RawPaper {
  key: string;            // 중복방지 키 (openalex id)
  title: string;
  abstract: string;       // 복원된 초록 (영어 원문)
  doi: string | null;
  url: string;            // 원문/랜딩 URL
  publicationDate: string;
  citedByCount: number;
  authors: string[];
  journalTitle: string | null;
  issns: string[];        // 정규화된 ISSN 목록
}

const OPENALEX = "https://api.openalex.org/works";

// abstract_inverted_index → 평문 초록 복원
function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, posList] of Object.entries(inv)) {
    for (const p of posList) positions.push({ pos: p, word });
  }
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map((x) => x.word).join(" ").trim();
}

export interface FetchOptions {
  keywords: string[];
  lookbackDays: number;
  perPage?: number;       // 필터 전 후보 개수 (기본 100)
}

// 키워드로 최근 논문 후보를 검색 (SCIE/지표 필터는 상위 로직에서 수행)
export async function fetchCandidatePapers(opts: FetchOptions): Promise<RawPaper[]> {
  const { keywords, lookbackDays } = opts;
  const perPage = Math.min(opts.perPage ?? 100, 200);

  const query = keywords.map((k) => k.trim()).filter(Boolean).join(" ");
  if (!query) return [];

  const from = new Date(Date.now() - lookbackDays * 86400_000)
    .toISOString()
    .slice(0, 10);

  const filters = [
    `title_and_abstract.search:${query}`,
    `from_publication_date:${from}`,
    "type:article",
    "has_abstract:true",
  ].join(",");

  const url = new URL(OPENALEX);
  url.searchParams.set("filter", filters);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("sort", "relevance_score:desc");
  // polite pool
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": `paper-reporting/${mailto ?? "anon"}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAlex 요청 실패: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { results?: any[] };
  const results = data.results ?? [];

  return results.map((w): RawPaper => {
    const source = w.primary_location?.source ?? {};
    const issns = normalizeIssns([
      source.issn_l,
      ...(Array.isArray(source.issn) ? source.issn : []),
    ]);
    const doi: string | null = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, "") : null;
    const landing =
      w.primary_location?.landing_page_url ||
      (w.doi ? w.doi : `https://openalex.org/${String(w.id).split("/").pop()}`);
    return {
      key: String(w.id),
      title: w.title ?? w.display_name ?? "(제목 없음)",
      abstract: reconstructAbstract(w.abstract_inverted_index),
      doi,
      url: landing,
      publicationDate: w.publication_date ?? "",
      citedByCount: w.cited_by_count ?? 0,
      authors: (w.authorships ?? [])
        .map((a: any) => a.author?.display_name)
        .filter(Boolean)
        .slice(0, 8),
      journalTitle: source.display_name ?? null,
      issns,
    };
  });
}
