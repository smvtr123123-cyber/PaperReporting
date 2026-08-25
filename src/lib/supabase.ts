import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // 환경변수 누락 시 앱이 크래시하지 않도록 안내 후 플레이스홀더로 부팅
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. .env 를 확인하세요."
  );
}

// createClient 는 빈 문자열 URL 에서 예외를 던지므로 플레이스홀더로 대체
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key"
);

// 리포팅 설정 타입 (DB report_configs 와 일치)
export interface ReportConfig {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];       // AND 키워드 (모두 포함)
  or_keywords: string[];    // OR 키워드 (하나라도 포함)
  frequency: "daily" | "weekly" | "monthly";
  run_hour: number;
  day_of_week: number | null;
  day_of_month: number | null;
  recipients: string[];
  only_scie: boolean;
  min_quartile: "Q1" | "Q2" | "Q3" | "Q4" | null;
  lookback_days: number;
  max_results: number;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface ReportItem {
  titleKo: string;
  titleEn: string;
  summaryKo: string;
  abstractKo: string;
  journalTitle: string | null;
  isScie: boolean;
  sjrQuartile: string | null;
  sjr: number | null;
  citescore: number | null;
  authors: string[];
  publicationDate: string;
  citedByCount: number;
  url: string;
  doi: string | null;
}

export interface ReportMeta {
  keywords?: string[];     // AND 키워드
  orKeywords?: string[];   // OR 키워드
  configName?: string;
  items?: ReportItem[];
}

export interface SentReport {
  id: string;
  config_id: string | null;
  status: "success" | "failed" | "partial" | "skipped";
  paper_count: number;
  recipients: string[];
  error: string | null;
  meta: ReportMeta | null;
  ran_at: string;
}
