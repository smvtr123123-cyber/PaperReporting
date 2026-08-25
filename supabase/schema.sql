-- =====================================================================
-- 논문 리포팅 서비스 - Supabase 스키마
-- Supabase 프로젝트 SQL Editor 에 붙여넣어 실행하세요.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. 리포팅 설정 (사용자별 키워드 / 주기 / 수신 이메일)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.report_configs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  -- 해시태그 키워드 (# 제외한 순수 키워드 배열)
  keywords      text[] not null default '{}',   -- AND 그룹: 모두 포함되어야 함
  or_keywords   text[] not null default '{}',   -- OR 그룹: 하나라도 포함되면 됨
  -- 주기: daily | weekly | monthly
  frequency     text not null default 'daily'
                  check (frequency in ('daily', 'weekly', 'monthly')),
  run_hour      int  not null default 9  check (run_hour between 0 and 23),   -- KST 기준 시
  run_minute    int  not null default 0  check (run_minute in (0)),           -- 정각 실행(스케줄러가 매시 정각 구동)
  day_of_week   int      check (day_of_week between 0 and 6),                 -- weekly: 0=일 ~ 6=토
  day_of_month  int      check (day_of_month between 1 and 28),               -- monthly: 1~28
  recipients    text[] not null default '{}',                                -- 수신 이메일 목록
  -- 발췌 옵션
  only_scie     boolean not null default true,       -- SCI/SCIE 등재 저널만
  min_quartile  text     check (min_quartile in ('Q1','Q2','Q3','Q4')),      -- 최소 Scimago 분위 (null=제한없음)
  lookback_days int  not null default 30,            -- 최근 N일 이내 출판 논문
  max_results   int  not null default 15,            -- 리포트당 최대 논문 수
  active        boolean not null default true,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_report_configs_user on public.report_configs (user_id);
create index if not exists idx_report_configs_active on public.report_configs (active) where active;

-- 마이그레이션: 기존 테이블에 OR 키워드 컬럼 추가 (신규 생성 시엔 위 정의로 이미 존재)
alter table public.report_configs
  add column if not exists or_keywords text[] not null default '{}';

-- ─────────────────────────────────────────────────────────────
-- 2. 저널 메타/지표 (SCI·SCIE 판별 + 영향력 지표)
--    Scimago(무료 CSV) + Clarivate SCIE 마스터 리스트(ISSN) 업로드로 채움.
--    ISSN 은 하이픈 제거·대문자 정규화하여 8자리로 저장 (예: 15499634).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.journal_metrics (
  issn          text primary key,                    -- 정규화된 ISSN (8자리, 하이픈 제거)
  title         text,
  is_scie       boolean not null default false,      -- SCI/SCIE(WoS) 등재 여부
  sjr           numeric,                             -- Scimago Journal Rank
  sjr_quartile  text,                                -- Q1~Q4
  citescore     numeric,                             -- Scopus CiteScore
  h_index       int,
  categories    text,
  publisher     text,
  source        text not null default 'scimago',     -- scimago | clarivate | manual
  updated_at    timestamptz not null default now()
);

create index if not exists idx_journal_scie on public.journal_metrics (is_scie) where is_scie;

-- ─────────────────────────────────────────────────────────────
-- 3. 발송 이력
-- ─────────────────────────────────────────────────────────────
create table if not exists public.sent_reports (
  id          uuid primary key default gen_random_uuid(),
  config_id   uuid references public.report_configs (id) on delete set null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'success'
                check (status in ('success', 'failed', 'partial', 'skipped')),
  paper_count int not null default 0,
  recipients  text[] not null default '{}',
  error       text,
  meta        jsonb,                                 -- 사용 키워드, 논문 요약 리스트 등
  ran_at      timestamptz not null default now()
);

create index if not exists idx_sent_reports_user on public.sent_reports (user_id, ran_at desc);
create index if not exists idx_sent_reports_config on public.sent_reports (config_id, ran_at desc);

-- ─────────────────────────────────────────────────────────────
-- 4. 중복 방지 (이미 보낸 논문은 다음 리포트에서 제외)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.seen_papers (
  config_id     uuid not null references public.report_configs (id) on delete cascade,
  paper_key     text not null,                       -- openalex id 또는 정규화 DOI
  first_seen_at timestamptz not null default now(),
  primary key (config_id, paper_key)
);

-- ─────────────────────────────────────────────────────────────
-- 5. updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_report_configs_updated on public.report_configs;
create trigger trg_report_configs_updated
  before update on public.report_configs
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.report_configs enable row level security;
alter table public.sent_reports   enable row level security;
alter table public.seen_papers     enable row level security;
alter table public.journal_metrics enable row level security;

-- report_configs: 본인 소유만 접근
drop policy if exists "own configs" on public.report_configs;
create policy "own configs" on public.report_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sent_reports: 본인 이력만 조회
drop policy if exists "own reports" on public.sent_reports;
create policy "own reports" on public.sent_reports
  for select using (auth.uid() = user_id);

-- seen_papers: 본인 설정에 속한 것만 (service_role 은 RLS 우회)
drop policy if exists "own seen" on public.seen_papers;
create policy "own seen" on public.seen_papers
  for select using (
    exists (select 1 from public.report_configs c
            where c.id = seen_papers.config_id and c.user_id = auth.uid())
  );

-- journal_metrics: 로그인 사용자 읽기 전용 (쓰기는 service_role 만)
drop policy if exists "read journals" on public.journal_metrics;
create policy "read journals" on public.journal_metrics
  for select using (auth.role() = 'authenticated');
