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
  andKeywords: string[];  // 모두 포함되어야 하는 키워드 (AND)
  orKeywords: string[];   // 하나라도 포함되면 되는 키워드 (OR)
  lookbackDays: number;
  perPage?: number;       // 필터 전 후보 개수 (기본 100)
}

// 검색어 1개를 OpenAlex 문법에 맞게 정규화한다.
// - 인용부호/괄호/쉼표 등 문법 충돌 문자를 제거 (쉼표는 filter 구분자라 특히 위험)
// - 공백이 포함된 다중 단어는 구문(phrase)으로 취급하도록 큰따옴표로 감싼다
function sanitizeTerm(raw: string): string {
  const clean = String(raw ?? "")
    .replace(/["()]/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

// AND 그룹 + OR 그룹을 하나의 boolean 검색식으로 조합한다.
// 두 그룹은 독립적으로 처리하고 합집합(OR)으로 묶는다:
//   (A AND B AND C) OR (X OR Y OR Z)
// → AND그룹(모두 포함) 논문이 없어도 OR그룹(하나라도 포함) 논문은 리포팅된다.
// 한쪽만 있으면 그 그룹만 사용한다.
export function buildSearchQuery(andKeywords: string[], orKeywords: string[]): string {
  const ands = (andKeywords ?? []).map(sanitizeTerm).filter(Boolean);
  const ors = (orKeywords ?? []).map(sanitizeTerm).filter(Boolean);
  const andPart = ands.join(" AND ");
  const orPart = ors.length ? `(${ors.join(" OR ")})` : "";
  if (andPart && orPart) return `(${andPart}) OR ${orPart}`;
  return andPart || orPart;
}

// OpenAlex 요청 (일시 과부하 503 / 레이트리밋 429 / 네트워크 오류 시 지수 백오프 재시도)
// 2026-02-13 부터 OpenAlex 는 API 키가 필요하며, 익명 검색은 부하 시 중단된다.
// OPENALEX_API_KEY 를 설정하면 중단 없이 안정적으로 조회된다.
async function fetchOpenAlexJson(url: string, mailto?: string): Promise<{ results?: any[] }> {
  const delays = [0, 1500, 4000, 8000]; // 최초 1회 + 최대 3회 재시도
  let lastErr = "";
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": `paper-reporting/${mailto ?? "anon"}` } });
    } catch (e: any) {
      lastErr = `네트워크 오류: ${e?.message ?? e}`;
      continue;
    }
    if (res.ok) return (await res.json()) as { results?: any[] };
    // 503(과부하)·429(레이트리밋)·5xx 는 재시도, 4xx 는 즉시 실패
    if (res.status === 503 || res.status === 429 || res.status >= 500) {
      lastErr = `OpenAlex ${res.status}: ${(await res.text()).slice(0, 200)}`;
      continue;
    }
    throw new Error(`OpenAlex 요청 실패: ${res.status} ${await res.text()}`);
  }
  throw new Error(`OpenAlex 요청 실패(재시도 후): ${lastErr}`);
}

// 키워드로 최근 논문 후보를 검색 (SCIE/지표 필터는 상위 로직에서 수행)
export async function fetchCandidatePapers(opts: FetchOptions): Promise<RawPaper[]> {
  const { andKeywords, orKeywords, lookbackDays } = opts;
  const perPage = Math.min(opts.perPage ?? 100, 200);

  const query = buildSearchQuery(andKeywords, orKeywords);
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
  // API 키(권장): 익명 검색 중단(503)을 방지. 없으면 mailto polite pool 로 최선 노력.
  const apiKey = process.env.OPENALEX_API_KEY;
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) url.searchParams.set("mailto", mailto);

  const data = await fetchOpenAlexJson(url.toString(), mailto);
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
