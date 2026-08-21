import { getAdminClient } from "./supabaseAdmin.js";
import { fetchCandidatePapers, type RawPaper } from "./openalex.js";
import { lookupJournals, pickMetric, passesQuartile, type JournalMetric } from "./journals.js";
import { translatePapers } from "./translate.js";
import { renderReportHtml, sendEmail, type ReportItem } from "./email.js";

export interface ReportConfig {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  frequency: string;
  run_hour: number;
  day_of_week: number | null;
  day_of_month: number | null;
  recipients: string[];
  only_scie: boolean;
  min_quartile: string | null;
  lookback_days: number;
  max_results: number;
}

export interface RunResult {
  status: "success" | "failed" | "skipped";
  paperCount: number;
  error?: string;
}

const KST = "ko-KR";

function nowKstString(): string {
  return new Intl.DateTimeFormat(KST, {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
}

// 설정 1건에 대한 리포트 생성 + 발송
export async function runReportForConfig(config: ReportConfig): Promise<RunResult> {
  const supabase = getAdminClient();

  try {
    if (config.recipients.length === 0) {
      return await finish(config, "skipped", 0, "수신 이메일이 없습니다.");
    }

    // 1. OpenAlex 후보 논문 검색
    const candidates = await fetchCandidatePapers({
      keywords: config.keywords,
      lookbackDays: config.lookback_days,
      perPage: Math.min(config.max_results * 6 + 20, 200),
    });

    // 2. 저널 지표 조회 (ISSN 매칭)
    const journalTable = await lookupJournals(candidates.map((c) => c.issns));

    // 3. SCIE / 분위 필터
    type Enriched = { paper: RawPaper; metric: JournalMetric | null };
    let enriched: Enriched[] = candidates.map((paper) => ({
      paper,
      metric: pickMetric(paper.issns, journalTable),
    }));

    if (config.only_scie) {
      enriched = enriched.filter((e) => e.metric?.is_scie === true);
    }
    enriched = enriched.filter((e) => passesQuartile(e.metric, config.min_quartile));

    // 4. 이미 보낸 논문 제외
    const { data: seenRows } = await supabase
      .from("seen_papers")
      .select("paper_key")
      .eq("config_id", config.id);
    const seen = new Set((seenRows ?? []).map((r) => r.paper_key));
    enriched = enriched.filter((e) => !seen.has(e.paper.key));

    // 5. 상위 N건 (인용수 → 최신순 정렬)
    enriched.sort((a, b) => {
      if (b.paper.citedByCount !== a.paper.citedByCount)
        return b.paper.citedByCount - a.paper.citedByCount;
      return (b.paper.publicationDate || "").localeCompare(a.paper.publicationDate || "");
    });
    const selected = enriched.slice(0, config.max_results);
    // 신규 논문이 0건이어도 "신규 없음" 안내 리포트를 발송한다.

    // 6. 번역 + 요약
    const translations = await translatePapers(
      selected.map((e) => ({
        key: e.paper.key,
        title: e.paper.title,
        abstract: e.paper.abstract,
      }))
    );

    // 7. 리포트 아이템 구성
    const items: ReportItem[] = selected.map((e) => {
      const t = translations.get(e.paper.key);
      return {
        titleKo: t?.titleKo || "",
        titleEn: e.paper.title,
        summaryKo: t?.summaryKo || "(요약 생성 실패)",
        abstractKo: t?.abstractKo || "(번역 생성 실패) " + e.paper.abstract.slice(0, 300),
        journalTitle: e.paper.journalTitle,
        isScie: e.metric?.is_scie ?? false,
        sjrQuartile: e.metric?.sjr_quartile ?? null,
        sjr: e.metric?.sjr ?? null,
        citescore: e.metric?.citescore ?? null,
        authors: e.paper.authors,
        publicationDate: e.paper.publicationDate,
        citedByCount: e.paper.citedByCount,
        url: e.paper.url,
        doi: e.paper.doi,
      };
    });

    // 8. 이메일 발송
    const html = renderReportHtml(
      { configName: config.name, keywords: config.keywords, generatedAt: nowKstString() },
      items
    );
    await sendEmail({
      to: config.recipients,
      subject: `[논문 리포트] ${config.name} · ${items.length}건`,
      html,
    });

    // 이력 상세/미리보기용 아이템 저장 (초록 전문은 길이 제한)
    const metaItems = items.map((it) => ({ ...it, abstractKo: it.abstractKo.slice(0, 1500) }));

    // 9. seen_papers 기록 (신규 논문이 있을 때만)
    if (selected.length > 0) {
      const seenInsert = selected.map((e) => ({
        config_id: config.id,
        paper_key: e.paper.key,
      }));
      await supabase.from("seen_papers").upsert(seenInsert, { onConflict: "config_id,paper_key" });
    }

    return await finish(config, "success", items.length, undefined, metaItems);
  } catch (err: any) {
    return await finish(config, "failed", 0, err?.message ?? String(err));
  }
}

// 이력 기록 + last_run_at 갱신
async function finish(
  config: ReportConfig,
  status: RunResult["status"],
  paperCount: number,
  error?: string,
  items?: unknown[]
): Promise<RunResult> {
  const supabase = getAdminClient();
  await supabase.from("sent_reports").insert({
    config_id: config.id,
    user_id: config.user_id,
    status,
    paper_count: paperCount,
    recipients: config.recipients,
    error: error ?? null,
    meta: { keywords: config.keywords, configName: config.name, items: items ?? [] },
  });
  await supabase.from("report_configs").update({ last_run_at: new Date().toISOString() }).eq("id", config.id);
  return { status, paperCount, error };
}
